# Infraestrutura (OpenTofu)

Esta pasta cria, em `us-east-1`:

| Recurso | Cliente | Admin |
|---|---|---|
| Lambda (Node 22, arm64), do mesmo zip | `cinemotion-customer` (`customer.handler`) | `cinemotion-admin` (`admin.handler`) |
| API Gateway HTTP API, rota `$default` | throttling de 50 req/s | throttling de 10 req/s |
| Concorrência reservada (= conexões no Postgres) | sem reserva (ver abaixo) | sem reserva |
| Bucket S3 privado + CloudFront (OAC) | `web/customer` | `web/admin` |

Em cada distribuição, `/api/*` vai para o API Gateway da sua API, sem cache e com os cabeçalhos do visitante (inclusive `Authorization`). O resto vem do S3. Uma CloudFront Function traduz `/sessao` em `/sessao/index.html`.

O banco é o RDS PostgreSQL 18 que já existe na conta. Ele é público e as Lambdas ficam fora da VPC, conectando com `sslmode=verify-full`. A CA do RDS vem de `NODE_EXTRA_CA_CERTS=/var/runtime/ca-cert.pem`.

O state fica no S3, em `s3://cinemotion-tfstate/infra/terraform.tfstate`, com lock nativo (um arquivo `.tflock` ao lado, sem DynamoDB). Assim a sua máquina e o GitHub Actions trabalham sobre o mesmo state. Ele **contém segredos** (as `DATABASE_URL` lidas do SSM e os `JWT_SECRET` gerados aqui), por isso o bucket é privado, criptografado e só aceita TLS. O bucket também é versionado: uma versão antiga do state pode ser recuperada por até 90 dias.

O bucket é criado por [`bootstrap/`](bootstrap/), que tem o próprio state local (sem segredos). Ele só precisa ser aplicado de novo se o bucket mudar.

## Uma vez só

0. **Banco e dono.** A instância é compartilhada com outros projetos, por isso o Cinemotion tem um banco e um usuário dono próprios. Conectado com o usuário master:

   ```sql
   CREATE ROLE cinemotion LOGIN PASSWORD '<senha-do-dono>' CREATEROLE;
   CREATE DATABASE cinemotion;
   GRANT cinemotion TO "DBAMaster";              -- o PG 16+ exige isso para transferir a posse
   ALTER DATABASE cinemotion OWNER TO cinemotion;
   ```

   Como dono do banco, o `cinemotion` é dono do schema `public` e pode instalar o `btree_gist`. O `CREATEROLE` serve para a migration `0001` criar os roles da aplicação.

1. **Senha dos roles da aplicação.** A migration `0001` cria `cinemotion_customer` e `cinemotion_admin` sem senha. Depois da primeira migration, conectado ao banco `cinemotion` com o usuário dono:

   ```sql
   ALTER ROLE cinemotion_customer PASSWORD '<senha-forte-1>';
   ALTER ROLE cinemotion_admin    PASSWORD '<senha-forte-2>';
   ```

2. **Parâmetros no SSM** (SecureString), um por API, com a URL do role de cada uma:

   ```sh
   aws ssm put-parameter --profile homeleft --type SecureString \
     --name /cinemotion/customer/database-url \
     --value 'postgres://cinemotion_customer:<senha-forte-1>@<endpoint-rds>:5432/<banco>?sslmode=verify-full'

   aws ssm put-parameter --profile homeleft --type SecureString \
     --name /cinemotion/admin/database-url \
     --value 'postgres://cinemotion_admin:<senha-forte-2>@<endpoint-rds>:5432/<banco>?sslmode=verify-full'
   ```

   Para trocar uma senha depois, use `--overwrite` e rode o apply de novo.

3. **Credencial do dono para o CI**, lida só pelo role de deploy:

   ```sh
   aws ssm put-parameter --profile homeleft --type SecureString \
     --name /cinemotion/owner/database-url \
     --value 'postgres://cinemotion:<senha-do-dono>@<endpoint-rds>:5432/<banco>?sslmode=verify-full'
   ```

4. **Bootstrap** (bucket do state, provedor OIDC do GitHub e role `cinemotion-github-deploy`): `cd infra/bootstrap && tofu init && AWS_PROFILE=homeleft tofu apply`.

5. `cd infra && AWS_PROFILE=homeleft tofu init`

## A cada deploy

Pelo GitHub Actions: ao fechar uma release ou um hotfix (`gfrf`/`gfhf`), a tag `x.y.z` publicada dispara o [`deploy.yml`](../.github/workflows/deploy.yml). Ele assume o role `cinemotion-github-deploy` por OIDC, roda as migrations com a credencial do dono lida do SSM, gera os artefatos e faz o `tofu apply`. Os endereços aparecem no resumo da execução.

Os PRs e os pushes de branch passam pelo [`ci.yml`](../.github/workflows/ci.yml) (typecheck, testes, builds e `tofu validate`), que não acessa a AWS.

Para testar as permissões do role da sua máquina, um administrador da conta pode assumi-lo:

```sh
aws sts assume-role --profile homeleft --role-arn arn:aws:iam::576060958067:role/cinemotion-github-deploy --role-session-name teste
```

### Deploy manual

Da raiz do repositório:

```sh
aws sso login --profile homeleft

# 1. Schema: com a credencial do dono, nunca com a das Lambdas. O `pg` do Node valida o
#    certificado mesmo com sslmode=require, então ele precisa da CA do RDS
#    (https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem).
NODE_EXTRA_CA_CERTS=~/rds-global-bundle.pem \
MIGRATION_DATABASE_URL='postgres://<dono>:<senha>@<endpoint-rds>:5432/<banco>?sslmode=require' \
  npm run db:migrate -w api

# 2. Artefatos: api/dist/lambda e web/*/.output/public.
npm run build:deploy

# 3. Infra + código + sites.
cd infra && AWS_PROFILE=homeleft tofu apply
```

O apply envia só o que mudou. Um zip novo atualiza as duas Lambdas, e arquivos que mudaram no site são enviados ao bucket (os que sumiram do build são apagados). HTML e payloads são servidos com `max-age=0`, então não é preciso invalidar o CloudFront. Os arquivos com hash (`_nuxt/`, `_fonts/`) ficam em cache por um ano.

No fim, `tofu output site_urls` mostra o endereço de cada site.

## Ajustes comuns

- **Concorrência:** a conta tem limite de 10 execuções simultâneas de Lambda, e a AWS exige manter essas 10 livres. Por isso o padrão é sem reserva (`-1`): o próprio limite da conta segura as conexões, com no máximo 10 somando as duas APIs, para um `max_connections` de cerca de 100 no `db.t4g.micro`. Se a cota for aumentada (Service Quotas, `L-B99A9384`), use `reserved_concurrency = { customer = 20, admin = 5 }` num `terraform.tfvars`.
- **Muitas conexões no RDS:** com reserva, a soma das concorrências reservadas é o máximo de conexões abertas pelas Lambdas. Ela precisa caber no `max_connections` da instância, contando a folga para o usuário dono.
- **Visitantes no Brasil:** `price_class = "PriceClass_All"` serve a partir de pontos de presença na América do Sul, com custo maior.
