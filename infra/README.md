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

O state é local (`infra/terraform.tfstate`, ignorado pelo git) e **contém segredos**: as `DATABASE_URL` lidas do SSM e os `JWT_SECRET` gerados aqui. Não versione esse arquivo nem o compartilhe. Se ele for perdido, um novo apply gera outros segredos JWT, e os tokens emitidos até então deixam de valer.

## Uma vez só

1. **Senha dos roles da aplicação.** A migration `0001` cria `cinemotion_customer` e `cinemotion_admin` sem senha. Conectado ao RDS com o usuário dono:

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

3. `cd infra && tofu init`

## A cada deploy

Da raiz do repositório:

```sh
aws sso login --profile homeleft

# 1. Schema: com a credencial do dono, nunca com a das Lambdas.
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
