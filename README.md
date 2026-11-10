# Cinemotion

API REST para gerenciar Salas, Filmes, Sessões e Reservas de assentos de uma rede de cinemas, com a garantia de que **um assento nunca é vendido duas vezes**, mesmo com vários clientes tentando reservá-lo ao mesmo tempo.

São duas APIs geradas a partir de um único código:

| API | Base local | Para quem | O que faz |
|---|---|---|---|
| **Cliente** | `http://localhost:3000/api` | Clientes | Cadastro e login, catálogo público, mapa de ocupação, Reserva, confirmação (pagamento simulado) e cancelamento |
| **Administrador** | `http://localhost:3001/api/admin` | Administradores | Login, Salas com mapa de assentos, Filmes e Sessões |

E dois sites, um para cada API, em [`web/`](web/):

| Site | Local | O que dá para fazer |
|---|---|---|
| **Cliente** | `http://localhost:3100` | Ver as sessões por filme e dia, escolher assentos no mapa, reservar (com a contagem dos 10 minutos), confirmar o pagamento simulado, cancelar e ver as próprias reservas |
| **Administrador** | `http://localhost:3101` | Criar Salas e marcar no mapa os assentos acessíveis e em manutenção; cadastrar Filmes; criar, editar e excluir Sessões |

- Documentação OpenAPI 3.2: [`docs/swagger.yaml`](docs/swagger.yaml)
- Collection com os principais fluxos: [`http/cinemotion.http`](http/cinemotion.http) (REST Client) e [`http/cinemotion.postman_collection.json`](http/cinemotion.postman_collection.json) (Postman)
- Vocabulário do domínio: [`GLOSSARY.md`](GLOSSARY.md)
- Decisões técnicas em detalhe: [`docs/decisoes_tecnicas.md`](docs/decisoes_tecnicas.md) e [`docs/adr/`](docs/adr/)

## Sumário

- [Stack e justificativa](#stack-e-justificativa)
- [Como rodar](#como-rodar)
- [Testes](#testes)
- [Banco de dados, migrations e seed](#banco-de-dados-migrations-e-seed)
- [Documentação da API e collection](#documentação-da-api-e-collection)
- [Premissas assumidas](#premissas-assumidas)
- [Decisões técnicas](#decisões-técnicas)
- [O que ficou de fora](#o-que-ficou-de-fora)
- [Estrutura do repositório](#estrutura-do-repositório)
- [Fluxo de trabalho no Git](#fluxo-de-trabalho-no-git)

## Stack e justificativa

| Camada | Escolha |
|---|---|
| API | Node.js 22 + TypeScript + Express 5, organizada por módulos de domínio (DDD) |
| Execução | AWS Lambda, com o Express adaptado por `serverless-http` |
| Banco | PostgreSQL 18, com migrations versionadas (`node-pg-migrate`, SQL puro) |
| Validação | zod, com mensagens em português |
| Autenticação | JWT (HS256, `jose`) e senhas com bcrypt |
| Testes | Vitest, Supertest e Testcontainers |
| Frontends | Nuxt 4 (SSG) + Nuxt UI + Tailwind 4, no S3 atrás do CloudFront |
| Infraestrutura | OpenTofu |

**Por que não C#/.NET e Angular:** a stack da empresa foi considerada, mas escolhi Node.js/TypeScript e Nuxt pela familiaridade. Assim o tempo do desafio vai para o que ele avalia: as regras de negócio e a garantia de concorrência, que ficam no PostgreSQL (índice único parcial, exclusion constraint, locks) e valeriam igual em qualquer linguagem.

## Como rodar

### Pré-requisitos

- **Node.js 22** ou superior (há um `.nvmrc`).
- **PostgreSQL 18**, que tem `uuidv7()` nativo. Pode ser o do `docker-compose.yml` ou um já instalado.
- **`psql`** no PATH, usado pelos scripts de reset e seed.

### Passo a passo

```bash
# 1. Dependências (workspaces npm)
npm install

# 2. Configuração local; o .env nunca é versionado
cp api/.env.example api/.env

# 3. PostgreSQL 18 (pule se já tiver um rodando na 5432 com usuário postgres/postgres)
docker compose up -d
#    Porta ocupada? POSTGRES_PORT=5433 docker compose up -d  (e ajuste as URLs no api/.env)

# 4. Cria o banco do zero: migrations, senhas de dev dos roles e seed
npm run db:reset -w api

# 5. Sobe as duas APIs, com reload automático
npm run dev -w api
#    API cliente em http://localhost:3000/api
#    API admin   em http://localhost:3001/api/admin
```

Para conferir: `curl localhost:3000/api/health` e `curl localhost:3001/api/admin/health` devem responder `{"status":"ok","database":"ok"}`.

Com as APIs no ar, suba os sites, cada um no seu terminal:

```bash
npm run dev:customer   # site do cliente em http://localhost:3100
npm run dev:admin      # site do admin   em http://localhost:3101
```

Cada site chama a sua API em `/api`, no próprio endereço: o `devProxy` do Nuxt encaminha para as portas 3000 e 3001, como o CloudFront faz na AWS (com a API em outra porta: `API_PROXY_TARGET=http://localhost:<porta> npm run dev:customer`). Para gerar os sites estáticos: `npm run build:web` (saída em `web/*/.output/public`).

> **Atenção:** o `db:reset` apaga e recria o banco apontado por `MIGRATION_DATABASE_URL`.

### Usuários do seed

Todos usam a senha `Senha@123`.

| Papel | E-mails |
|---|---|
| Administrador | `admin@cinemotion.dev`, `gerente@cinemotion.dev` |
| Cliente | `ana.souza@email.com`, `bruno.lima@email.com`, `joao.pereira@email.com` e outros 7 |

Também dá para cadastrar um cliente novo no site ou em `POST /api/auth/register`. Administrador não tem cadastro público.

### Exemplo rápido

Reserva os dois primeiros assentos livres da próxima Sessão (usa `curl` e `jq`):

```bash
TOKEN=$(curl -s localhost:3000/api/auth/login -H 'content-type: application/json' \
  -d '{"email":"ana.souza@email.com","password":"Senha@123"}' | jq -r .accessToken)

SESSION=$(curl -s 'localhost:3000/api/sessions?pageSize=1' | jq -r '.items[0].id')
SEATS=$(curl -s localhost:3000/api/sessions/$SESSION/seats | jq -c '[.seats[] | select(.state=="available") | .id][:2]')

curl -s localhost:3000/api/reservations -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d "{\"sessionId\":\"$SESSION\",\"seatIds\":$SEATS}" | jq
```

Os fluxos completos, inclusive os de erro, estão na [collection](#documentação-da-api-e-collection).

## Testes

```bash
npm test -w api                 # tudo: unitários + integração
npm run test:unit -w api        # só unitários (não precisa de banco)
npm run test:integration -w api # só integração
npm run typecheck -w api
```

Os testes de integração sobem um **PostgreSQL 18 descartável com o Testcontainers**, que exige Docker. Cada suíte aplica as migrations num banco limpo.

**Sem Docker**, ou com o Docker sem acesso às portas publicadas (alguns setups de WSL), aponte para um PostgreSQL 18 já rodando com um superusuário. Os testes criam um banco temporário `cinemotion_test_<uuid>` e o removem no fim. O banco do `.env` não é tocado.

```bash
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm test -w api
```

### O que os testes cobrem

- **Unitários** (`api/test/unit`): as regras de negócio puras, com relógio injetado. Cobrem o prazo de 10 minutos, o limite de 2 horas (inclusive), a Sessão iniciada, de 1 a 6 assentos, a precedência dos estados no mapa, o cálculo do fim da Sessão (duração + 15 min), o mapa de assentos, o login em tempo constante, o JWT por audiência, a tradução de erros do Postgres e os Problem Details.
- **Integração** (`api/test/integration`): as APIs reais via HTTP contra o banco real, com os roles do Postgres de cada API.
- **Concorrência** (`api/test/integration/booking.test.ts`):
  - **10 clientes** pedem **o mesmo assento ao mesmo tempo**: exatamente um recebe `201`, e os outros nove recebem `409 seat-already-taken`.
  - Pedidos com **assentos sobrepostos** (B2+B3 contra B3+B4) têm um só vencedor, e o perdedor não deixa retenção parcial.
  - Removendo o índice único parcial da migration, esses testes falham. É ele que garante a venda única.
- **Contrato da documentação** (`api/test/unit/shared/openapi-contract.test.ts`): as rotas montadas no Express precisam bater exatamente com os caminhos do `docs/swagger.yaml`.

## Banco de dados, migrations e seed

| O quê | Onde |
|---|---|
| Migrations (SQL puro, com up e down) | [`api/migrations/`](api/migrations/) |
| Seed (dados de exemplo) | [`api/seeds/seed.sql`](api/seeds/seed.sql) |
| Reset completo do banco local | [`api/scripts/db-reset.sh`](api/scripts/db-reset.sh) |
| Diagrama (pgModeler, só referência) | [`docs/model/`](docs/model/) |

```bash
npm run db:reset -w api          # DROP/CREATE + migrations + senhas de dev + seed
npm run db:migrate -w api        # aplica migrations pendentes
npm run db:migrate:down -w api   # desfaz a última
npm run db:seed -w api           # recarrega só os dados de exemplo (idempotente)
```

- `0001_init.sql`: tabelas, constraints com nome estável (contrato do tradutor de erros), roles `cinemotion_admin` e `cinemotion_customer` com `GRANT`s mínimos.
- `0002_lock_session_for_booking.sql`: função `SECURITY DEFINER` que trava a Sessão durante a Reserva. Ver [Decisões técnicas](#decisões-técnicas).

**O seed** tem 2 administradores, 10 clientes, 10 Filmes, 3 Salas (A1–J12, A1–H10 e A1–E8), 66 Sessões e 34 Reservas em todos os estados. As datas são relativas a `now()`, então rodar o seed de novo atualiza a programação. Há Sessões preparadas para testar as regras:

| Sessão | Para testar |
|---|---|
| Começa em ~1 hora (Sala 1) | Reserva permitida; cancelamento recusado, porque faltam menos de 2 horas |
| Começou há 30 minutos (Sala 2) | Reserva recusada (`session-already-started`) |
| Passou há 3 dias (Sala 3 VIP) | Não aparece na listagem de Sessões futuras |

## Documentação da API e collection

**OpenAPI 3.2** em [`docs/swagger.yaml`](docs/swagger.yaml), um documento para as duas APIs. Os caminhos `/api/admin/*` apontam para o servidor da porta 3001, e as tags agrupam cada API. Ele descreve os schemas de entrada e saída, os dois esquemas de token, as regras de Reserva e todos os erros, com exemplos.

Para visualizar localmente com o Swagger UI, sem instalar nada no projeto:

```bash
docker run --rm -p 8080:8080 -e SWAGGER_JSON=/spec/swagger.yaml -v "$PWD/docs:/spec" swaggerapi/swagger-ui
# abra http://localhost:8080 (ou cole o arquivo em https://editor.swagger.io)

npx @redocly/cli@2 lint docs/swagger.yaml   # valida o documento
```

**Collection** com 42 requisições, em dois formatos com o mesmo conteúdo:

| Arquivo | Programa |
|---|---|
| [`http/cinemotion.http`](http/cinemotion.http) | [VS Code REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client) |
| [`http/cinemotion.postman_collection.json`](http/cinemotion.postman_collection.json) | Postman (*Import*) ou Newman, na linha de comando |

As pastas (e as seções do `.http`) seguem as tags do `swagger.yaml`: **API › recurso** (Autenticação, Salas, Filmes, Sessões, Catálogo, Reservas). Cada caso de erro (✗) fica junto do endpoint que ele testa, como uma requisição própria, para rodar e ser verificado junto com o resto.

No Postman, cada requisição traz também um **exemplo com a resposta real**, capturado numa execução contra o seed. Assim dá para ver o formato da resposta sem subir a API, e o mock server do Postman funciona.

A versão do Postman confere o status esperado de cada requisição e, nos erros, o `type` do Problem Details. Assim ela também serve de teste de ponta a ponta com a API rodando:

```bash
npx newman run http/cinemotion.postman_collection.json
```

A collection cria a própria Sala, Filme e Sessões, então roda várias vezes sem limpar o banco. Rode de cima para baixo, porque as requisições usam as respostas anteriores. As três pastas principais rodam nesta ordem:

1. **Admin:** login, criar Sala (com assentos acessíveis e em manutenção), marcar assento em manutenção, criar Filme e duas Sessões. Erros: sobreposição, início no passado, validação e falta de token.
2. **Cliente:** catálogo público, mapa de assentos, cadastro, login, reservar, confirmar e cancelar, com as repetições idempotentes. Erros: assento já ocupado, assento em manutenção, cancelamento a menos de 2 horas, e-mail repetido e administrador tentando entrar na API cliente.
3. **Regras entre as APIs:** token do cliente recusado na API admin, editar uma Sessão com Venda (`409`), excluir uma Sala com Sessões (`409`) e remarcar uma Sessão cuja Reserva foi cancelada.

### Erros

Todo erro segue o **Problem Details (RFC 9457)**, com `Content-Type: application/problem+json`. O `type` é estável (`/problems/<código>`) e serve para o cliente decidir o que fazer:

```json
{
  "type": "/problems/seat-already-taken",
  "title": "Conflito",
  "status": 409,
  "detail": "Um ou mais assentos já estão reservados ou vendidos nesta sessão.",
  "instance": "/reservations",
  "conflictingSeats": [{ "id": "0190f0e0-…", "label": "B3" }]
}
```

A lista completa de códigos está no swagger e em [`docs/decisoes_tecnicas.md`](docs/decisoes_tecnicas.md#erros-da-api).

## Premissas assumidas

Pontos que o enunciado deixa em aberto e como foram resolvidos:

- **Uma rede, um fuso:** todas as Salas estão em `America/Sao_Paulo`. O filtro por data usa o dia nesse fuso.
- **Datas:** a API responde em ISO 8601 UTC e o frontend formata no fuso da rede. Na entrada, data/hora sem fuso explícito é recusada, para não ficar ambígua ([ADR 0002](docs/adr/0002-datas-em-utc-formatadas-no-frontend.md)).
- **Fim da Sessão:** início + duração do Filme + 15 minutos de limpeza, fixado na criação. Mudar a duração do Filme depois não altera Sessões existentes; reagendar ou trocar o Filme da Sessão recalcula.
- **Preço por Sessão**, igual para todos os Assentos. O `total` da Reserva é preço × quantidade de Assentos.
- **"Sessão já começou"** vale a partir do horário de início (`now() >= starts_at`).
- **Cancelamento:** permitido para Reserva pendente ou Venda até exatamente 2 horas antes do início, inclusive. Cancelar libera os Assentos.
- **Confirmação** é aceita enquanto a Reserva estiver no prazo de 10 minutos, mesmo que a Sessão já tenha começado. O pagamento foi feito dentro do prazo.
- **Confirmar e cancelar são idempotentes:** repetir devolve a Reserva no estado atual. Assim um retry do pagamento não vira erro.
- **Limite de 6 Assentos por Reserva**, não por Cliente na Sessão.
- **Assento em manutenção** não aceita novas Reservas, mas Reservas e Vendas já feitas continuam valendo. No mapa, "reservado" e "vendido" prevalecem sobre "indisponível".
- **Mapa de assentos imutável:** definido na criação da Sala (fileiras A, B, …, Z, AA, …, até 30, com até 99 assentos cada). Depois só mudam as marcações de acessível e em manutenção.
- **Sessão com Reserva ativa** (pendente no prazo ou Venda) não pode ser editada nem excluída.
- **Catálogo público:** Filmes, Salas, Sessões e o mapa de ocupação podem ser lidos na API do Cliente sem login, para escolher antes de entrar.
- **Administradores** existem só via seed/migration. Não há cadastro nem promoção de usuário pela API.
- **Reserva de outro Cliente** responde 404, sem revelar que ela existe.
- **Todo controle de tempo** usa o relógio do banco (`now()` na transação), não o do servidor da API.
- **Nos sites, as datas são sempre do fuso da rede**, mesmo que o navegador esteja em outro: o admin digita 19:30 e a Sessão começa às 19:30 de Brasília.
- **Token no `localStorage`:** os sites são estáticos e a API usa Bearer, então o token fica no armazenamento do domínio de cada site e expira em 1 hora. Os sites não carregam scripts de terceiros, o que reduz o risco de XSS ler o token.

## Decisões técnicas

O detalhamento está em [`docs/decisoes_tecnicas.md`](docs/decisoes_tecnicas.md). As decisões com trade-off registrado estão em [`docs/adr/`](docs/adr/). As principais:

**Venda nunca duplicada.** A garantia está no banco: um **índice único parcial** em `reservation_seat (session_id, seat_id) WHERE released_at IS NULL`. A Reserva insere todos os assentos num único `INSERT`, numa transação. Se um deles já estiver retido, o Postgres recusa e a transação inteira é desfeita, cumprindo o "todos ou nenhum". Não há `SELECT` prévio nem lock de assento, então não há janela entre checar e gravar. A API traduz a violação em `409 seat-already-taken` com a lista completa dos assentos em conflito.

**Sessões sem sobreposição.** Uma **exclusion constraint GiST** (`session_no_overlap`) impede dois intervalos `[início, fim)` sobrepostos na mesma Sala. A regra vale mesmo com dois administradores criando Sessões ao mesmo tempo.

**Expiração sem job.** A Reserva pendente não é encerrada por um processo agendado. Toda leitura trata `pending` com o prazo vencido como expirada, e a transação de Reserva libera as vencidas da Sessão antes de inserir. Em Lambda, isso evita execuções contínuas de um agendador sem perder correção ([ADR 0001](docs/adr/0001-expiracao-preguicosa-de-reservas.md)).

**Edição de Sessão contra Reserva concorrente.** Editar ou excluir trava a Sessão com `FOR UPDATE`, e a Reserva a trava com `FOR SHARE`, então as duas nunca se cruzam. Como `FOR SHARE` exige privilégio de `UPDATE` e o role do Cliente só lê o catálogo, o lock é feito por uma função `SECURITY DEFINER` que só esse role pode executar (migration `0002`).

**Duas APIs, um código.** Os handlers `customer` e `admin` montam só as rotas do seu papel e viram duas Lambdas. Domínio, migrations e tradutor de erros existem em uma cópia só. A API do cliente responde sob `/api` e a do admin sob `/api/admin`: cada frontend chama a sua API no próprio domínio (o CloudFront encaminha `/api/*` ao API Gateway), sem CORS, e as duas cabem num único documento OpenAPI.

**Privilégio mínimo no banco.** Cada API conecta com o seu role. `cinemotion_customer` não escreve no catálogo, e `cinemotion_admin` não escreve em Reservas. As migrations rodam com outra credencial, a de dono do schema.

**Autenticação.** JWT com um **segredo e uma audiência por API**: o token de uma não vale na outra, mesmo que um segredo vaze. O login responde o mesmo erro, em tempo constante, para e-mail inexistente, senha errada e papel errado. Senhas com bcrypt (de 8 caracteres a 72 bytes).

**Erros.** Um tradutor central converte erros de domínio e erros do Postgres (pelo `SQLSTATE` e pelo nome da constraint) em Problem Details. A mensagem crua do banco nunca chega ao cliente.

**Arquitetura.** Módulos `catalog`, `booking` e `identity`, cada um com `domain` (regras puras, sem I/O), `application` (casos de uso e transações), `infrastructure` (repositórios SQL) e `http` (rotas, validação e apresentação). O domínio não conhece HTTP nem SQL, e por isso as regras são testáveis sem banco.

**Sites estáticos.** Dois projetos Nuxt (`web/customer` e `web/admin`) que estendem uma camada comum (`web/shared`: cliente HTTP, sessão, formatação de datas e o mapa de assentos). Assim nenhuma tela do admin vai para o site público. Os dados vêm da API no navegador, e as páginas de um item usam a query (`/sessao?id=…`), porque o site é gerado sem conhecer os ids e não precisa de regra de reescrita no CloudFront. A regra de negócio fica na API: os sites só orientam (limite de 6 assentos, prazo de cancelamento) e mostram o `detail` do Problem Details quando a API recusa.

**Deploy.** Lambda + API Gateway HTTP API por API, frontends Nuxt SSG no S3 via CloudFront, tudo em OpenTofu, sem domínio próprio. Cada Lambda usa um `pg.Pool` com uma conexão e concorrência reservada limitada, para não esgotar as conexões do Postgres sem precisar de RDS Proxy.

## O que ficou de fora

| Item | Por quê |
|---|---|
| Job agendado de expiração de Reservas | Desnecessário para a correção (a expiração é verificada em toda leitura) e custaria execuções contínuas em Lambda ([ADR 0001](docs/adr/0001-expiracao-preguicosa-de-reservas.md)) |
| Reembolso ou cancelamento automático de Vendas quando um assento entra em manutenção | Envolve política comercial (avisar, reembolsar, realocar) que o enunciado não define |
| Cancelamento de Reservas de clientes pelo administrador | Não pedido; o perfil admin ficou restrito ao catálogo, como no enunciado |
| Limite de assentos por Cliente na Sessão | O enunciado fala em 6 por Reserva; limitar por Cliente seria uma regra nova |
| Preço por Assento ou por tipo de Cliente (meia-entrada) | Fora do escopo; o preço é da Sessão |
| Cinemas em fusos diferentes | A rede foi assumida num fuso só; o fuso já é uma configuração única (`APP_TIMEZONE`) |
| Cadastro e promoção de administradores pela API | Reduz a superfície de ataque; administradores vêm do seed |
| Refresh token e logout | O token dura 1 hora; para o escopo, autenticação simples basta |
| RDS Proxy | Custo; a concorrência é limitada na própria Lambda |
| Domínio próprio | São usadas as URLs padrão da AWS, que já têm HTTPS |
| Testes automatizados dos sites | Prazo; as regras estão na API, que tem os testes. Os fluxos dos dois sites foram verificados no navegador |

## Estrutura do repositório

```
api/                  API (Express + TypeScript), um código para as duas Lambdas
  migrations/         migrations SQL versionadas
  seeds/              dados de exemplo
  scripts/            reset do banco local
  src/
    apps/             montagem de cada API (customer / admin)
    handlers/         entrada das Lambdas
    modules/          catalog, booking e identity (domain / application / infrastructure / http)
    shared/           erros, banco, Problem Details e validação
    server.ts         servidor local com as duas APIs
  test/               unit/ e integration/
docs/                 decisões técnicas, ADRs, swagger.yaml, modelo do banco
http/                 collection .http
infra/                OpenTofu (deploy passo a passo em infra/README.md)
web/
  shared/             camada Nuxt comum: cliente HTTP, sessão, datas, mapa de assentos
  customer/           site do cliente
  admin/              site do administrador
GLOSSARY.md           vocabulário do domínio
```

## Fluxo de trabalho no Git

- **git flow**: `main` (versões publicadas) e `develop` (integração). Cada funcionalidade nasce numa branch `feature/*` e entra em `develop` ao ser fechada. Versões são tags SemVer sem prefixo (ex.: `1.0.0`).
- **Conventional Commits**, em português (`feat(booking): reserva atômica`, `test(booking): concorrência com 10 clientes`). O histórico conta a evolução: base da API → autenticação → catálogo → reservas → documentação.
