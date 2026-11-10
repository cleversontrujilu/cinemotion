---
last_mapped: 2026-11-08T15:05:09Z
total_files: 137
total_tokens: 153709
---

# Codebase Map

> Gerado pelo Cartographer. Último mapeamento: 2026-11-08T15:05:09Z (commit `d69f878`, branch `develop`).

Cinemotion: API REST de Salas, Filmes, Sessões e Reservas de assentos para uma rede de cinemas. A garantia central é que **um assento nunca é vendido duas vezes**, mesmo com requisições concorrentes. É um desafio técnico com entrega em 11/11/2026.

Um mesmo código gera **duas APIs** (cliente e administrador) e **dois sites estáticos** (Nuxt), todos sobre um único PostgreSQL 18.

| | API (local) | Site (local) | Prefixo | Papel no banco | Audience JWT |
|---|---|---|---|---|---|
| Cliente | `:3000` | `:3100` | `/api` | `cinemotion_customer` | `cinemotion-customer` |
| Administrador | `:3001` | `:3101` | `/api/admin` | `cinemotion_admin` | `cinemotion-admin` |

## System Overview

```mermaid
graph TB
    subgraph Browser
        CW[web/customer<br/>Nuxt SSG :3100]
        AW[web/admin<br/>Nuxt SSG :3101]
        SH[web/shared<br/>camada Nuxt]
        CW -.extends.-> SH
        AW -.extends.-> SH
    end
    subgraph Edge["CloudFront (planejado) / Nuxt devProxy (local)"]
        P1["/api/* → API cliente"]
        P2["/api/* → API admin"]
    end
    subgraph API["api/ (Express 5, um artefato)"]
        CA[createCustomerApp<br/>identity + catalog público + booking]
        AA[createAdminApp<br/>identity + catalog admin]
        S[server.ts local<br/>ou handlers/*.ts Lambda]
    end
    subgraph DB["PostgreSQL 18"]
        T[(theater, seat, movie, session,<br/>app_user, reservation, reservation_seat)]
        F[[lock_session_for_booking<br/>SECURITY DEFINER]]
    end
    CW --> P1 --> CA
    AW --> P2 --> AA
    S --> CA
    S --> AA
    CA -- role cinemotion_customer --> T
    CA --> F
    AA -- role cinemotion_admin --> T
```

## Directory Structure

```
cinema/
├── package.json            # workspaces: api, web/*; scripts dev:*, build:web, typecheck:web
├── tsconfig.base.json      # strict, NodeNext, exactOptionalPropertyTypes, noUncheckedIndexedAccess
├── docker-compose.yml      # postgres:18 (cinemotion-postgres), TZ America/Sao_Paulo, POSTGRES_PORT
├── README.md               # premissas, decisões, como rodar, fora de escopo, seed
├── GLOSSARY.md             # linguagem do domínio (Sala, Sessão, Reserva, Venda…)
├── api/
│   ├── migrations/         # node-pg-migrate em SQL puro (0001_init, 0002_lock_session_for_booking)
│   ├── seeds/seed.sql      # idempotente (TRUNCATE + INSERT), datas relativas a now()
│   ├── scripts/db-reset.sh # DROP/CREATE + migrate + senhas dev dos papéis + seed
│   ├── src/
│   │   ├── server.ts       # dev local: sobe as duas APIs num processo
│   │   ├── handlers/       # entradas Lambda (serverless-http), uma por API
│   │   ├── apps/           # create-app.ts + composição customer.ts / admin.ts
│   │   ├── config/env.ts   # leitura de env com zod
│   │   ├── modules/
│   │   │   ├── identity/   # login, cadastro, JWT, bcrypt, requireAuth
│   │   │   ├── catalog/    # salas, mapa de assentos, filmes, sessões
│   │   │   └── booking/    # reservas, mapa de ocupação, confirmação, cancelamento
│   │   └── shared/         # db (pool, transação), domain (erros, clock), http (Problem Details, tradutor pg, validação)
│   └── test/
│       ├── unit/           # regras puras + contrato OpenAPI + tradutor de erros
│       └── integration/    # supertest + PG18 real (Testcontainers ou TEST_DATABASE_URL)
├── web/
│   ├── shared/             # camada Nuxt: useApi, useAuth, SeatGrid, LoginForm, format, problem, rules, tipos
│   ├── customer/           # site do cliente (sessões, mapa, reserva, minhas reservas)
│   └── admin/              # site do admin (sessões, salas, mapa da sala, filmes)
├── docs/
│   ├── specs_desafio.md    # enunciado do desafio
│   ├── decisoes_tecnicas.md
│   ├── adr/                # 0001 expiração preguiçosa, 0002 datas em UTC formatadas no front
│   ├── swagger.yaml        # OpenAPI 3.2 único para as duas APIs (contrato testado)
│   └── model/              # pgModeler (referência, NÃO é a fonte do schema) + revisões do modelo
├── http/                   # cinemotion.http (REST Client) e coleção Postman equivalente (42 requests)
└── infra/modules/          # api_lambda/, static_site/ — só .gitkeep (OpenTofu ainda não escrito)
```

## Module Guide

### api — composição e entradas

| Arquivo | Papel |
|---|---|
| `api/src/apps/create-app.ts` | `createApp(role, deps, mountRoutes)`: JWT service do papel, `express.json` 100kb, `GET /health` (`SELECT 1`), rotas de auth (register só no cliente), rotas do app, montagem em `BASE_PATH[role]`, `notFoundHandler` + `errorHandler`. Exporta `BASE_PATH = {customer:'/api', admin:'/api/admin'}` |
| `api/src/apps/customer.ts` | Catálogo público + booking |
| `api/src/apps/admin.ts` | Só catálogo admin (sem booking) |
| `api/src/server.ts` | Local: dois pools (`CUSTOMER_DATABASE_URL`, `ADMIN_DATABASE_URL`), duas portas, SIGINT/SIGTERM |
| `api/src/handlers/{customer,admin}.ts` | Lambda: `serverless(createXApp(...))`, config e pool no escopo do módulo, `DATABASE_URL` + `JWT_SECRET` |
| `api/src/config/env.ts` | `loadDbConfig(env, urlVar)`, `loadAuthConfig(env, secretVar)` (secret ≥ 32 chars) |

CORS e throttling **não** ficam no app: API Gateway + CloudFront (ou o devProxy) resolvem, pois site e API compartilham domínio.

### api/src/modules — camadas

Cada módulo segue `domain/` (puro, sem I/O, define ports) → `application/` (casos de uso `xxxUseCases(deps)`, transações) → `infrastructure/` (repositórios `pgXxx(db: Queryable)`, funcionam com pool ou client de transação) → `http/` (`mountXxxRoutes`, schemas zod, presenters que convertem datas para ISO UTC).

#### identity
| Arquivo | Papel |
|---|---|
| `domain/user.ts` | `Role`, `User`, `PublicUser`, `normalizeEmail`, `PASSWORD_MIN_LENGTH=8`, `PASSWORD_MAX_BYTES=72` (limite do bcrypt) |
| `application/login.ts` | Sempre roda bcrypt (contra `DUMMY_HASH` se o e-mail não existe) e confere `role === app`; e-mail desconhecido, senha errada e papel errado → mesmo 401 `invalid-credentials` |
| `application/register-customer.ts` | Cria sempre `customer`; unicidade via índice `ux_app_user_email` → 409 `email-taken`. Não devolve token |
| `http/auth-routes.ts` | `POST /auth/login`, `POST /auth/register` (se `allowRegister`), `GET /auth/me` |
| `http/require-auth.ts` | `requireAuth(verifier)` → `req.auth`; `currentUser(req)` |
| `infrastructure/jwt-token-service.ts` | HS256 (`jose`), `iss=cinemotion`, audience por papel, claims `sub/email/role`; verificação exige `role` igual ao do app. Sem consulta ao banco (sem revogação) |
| `infrastructure/bcrypt-password-hasher.ts` | `bcryptjs` custo 10 |
| `infrastructure/pg-user-repository.ts` | `findByEmail` (por `lower(email)`), `create` |

#### catalog
| Arquivo | Papel |
|---|---|
| `domain/seat-map.ts` | `rowLabel` (base 26 bijetiva: 27 → AA), `buildSeatMap` (≤30 fileiras, ≤99 por fileira), `parseSeatLabel`, `unknownSeatLabels`. Mapa imutável após criar |
| `domain/session.ts` | `CLEANING_MINUTES=15`, `computeEndsAt`, `assertStartsInFuture`, `assertNoActiveReservations` |
| `application/theaters.ts` | create (mapa num INSERT com `unnest`), rename, `updateSeats` tudo-ou-nada (`unknown-seats`), delete (`in-use` via FK) |
| `application/movies.ts` | CRUD |
| `application/sessions.ts` | create/update/delete em transação; update/delete fazem `lockById` (`FOR UPDATE`) e recusam com reservas ativas (409 `session-has-active-reservations`); `ends_at` só é recalculado se mudar filme ou início |
| `http/schemas.ts` | Limites de entrada (nome ≤55, título ≤200, duração 1–600, preço ≥0 com 2 casas, `startsAt` com offset obrigatório, `pageSize` ≤100) |
| `http/routes.ts` | `mountCatalogPublicRoutes` (4 GETs sem auth) e `mountCatalogAdminRoutes` (tudo com auth) |
| `infrastructure/pg-catalog-repositories.ts` | Ordem de assentos `length(seat_row), seat_row, number`; filtro `date` como `[dia, dia+1)` `AT TIME ZONE tz`; total via `count(*) OVER ()`; `countActiveReservations` aplica a regra de expiração |

#### booking
| Arquivo | Papel |
|---|---|
| `domain/reservation.ts` | `MAX_SEATS_PER_RESERVATION=6`, `HOLD_MINUTES=10`, `CANCELLATION_DEADLINE_HOURS=2`; `effectiveStatus` (pending vencida = expired), `decideConfirmation`, `decideCancellation`, `assertSessionAcceptsReservations`, `assertValidSeatSelection` |
| `domain/occupancy.ts` | `seatState`: reservado/vendido têm precedência sobre indisponível |
| `application/booking.ts` | `reserve`, `confirm`, `cancel`, `get`, `listMine`, `occupancy` |
| `http/routes.ts` | `/sessions/:id/seats` (público) e `/reservations*` (Bearer) |
| `infrastructure/pg-booking-repository.ts` | SQL `ACTIVE_HOLD`, `RESERVATION_SELECT` (status efetivo calculado no SQL, `json_agg` de assentos, total em centavos), `expireOverdue`, `lockSessionForShare`, `lockReservation` (`FOR UPDATE OF r`), `findTakenSeats` |

### api/src/shared
| Arquivo | Papel |
|---|---|
| `domain/errors.ts` | `DomainError(kind, code, message, details)`; `kind` ∈ validation, unauthorized, forbidden, not-found, conflict |
| `domain/clock.ts` | `Clock` injetável. Usado **só** em iat/exp do JWT e testes; regras de negócio usam o `now()` do banco |
| `db/pool.ts` | `createPool` com `options: -c timezone=<tz>` |
| `db/transaction.ts` | `withTransaction`, `Queryable`, `databaseNow(db)` |
| `http/problem-details.ts` | `errorHandler`/`notFoundHandler` → RFC 9457 `application/problem+json`, `type=/problems/<code>` |
| `http/pg-error-translator.ts` | SQLSTATE + nome da constraint → `DomainError` (tabela em Gotchas) |
| `http/validation.ts` | `parseInput(schema, input)` com zod em pt-BR → `validation-error` com `errors[{path,message}]` |

### Banco (`api/migrations`)
- **0001_init.sql**: `btree_gist`, enums `user_role` e `reservation_status`, PKs `uuidv7()` (exige PG18), tabelas `app_user`, `movie`, `theater`, `seat`, `session`, `reservation`, `reservation_seat`, papéis `cinemotion_admin`/`cinemotion_customer` (LOGIN sem senha) com grants mínimos.
  - `session_no_overlap`: `EXCLUDE USING gist (theater_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)`.
  - `ux_reservation_seat_session_id_seat_id`: UNIQUE parcial `(session_id, seat_id) WHERE released_at IS NULL`. **É a garantia contra venda dupla.**
  - FK composta `reservation_seat(reservation_id, session_id) → reservation(id, session_id)`.
- **0002_lock_session_for_booking.sql**: função `SECURITY DEFINER` que faz `SELECT … FOR SHARE` em `session`; EXECUTE só para `cinemotion_customer` (que não tem UPDATE em `session` e por isso não pode fazer `FOR SHARE` direto).

### web/shared (camada Nuxt)
| Arquivo | Papel |
|---|---|
| `nuxt.config.ts` | `@nuxt/ui` v4, aliases `#api`/`#seats`, `ssr: true`, `apiBase='/api'`, `icon.localApiEndpoint='/_nuxt_icon'` (porque `/api` é da API) |
| `composables/useApi.ts` | `$fetch.create` com `baseURL=apiBase`, Bearer automático, 401 → `saveToken(null)` |
| `composables/useAuth.ts` | `token, user, loggedIn, fetchUser (/auth/me), login (/auth/login), logout` |
| `composables/useAuthToken.ts` | `localStorage['cinemotion:token'] = {accessToken, expiresAt}`; falha de storage → só memória |
| `middleware/auth.ts` | Opt-in; redireciona para `/entrar?redirect=<fullPath>`; ignora no servidor |
| `plugins/auth.client.ts` | Restaura token, descarta expirado, busca usuário |
| `components/SeatGrid.vue` | Grade genérica de assentos (props `seats`, `look`, `clickable`; emit `toggle`) usada por cliente e admin |
| `components/LoginForm.vue`, `SeatLegend.vue` | Login com `?redirect=` (só caminhos começando com `/`), legenda |
| `utils/format.ts` | Tudo em `America/Sao_Paulo` via Intl (ADR 0002); `toNetworkIso(date, hhmm)` gera ISO com offset |
| `utils/problem.ts` | `asProblem`, `isProblem(err, code)`, `problemMessage` |
| `utils/rules.ts` | Espelho das constantes da API (6 assentos, 10 min, 2 h, senha 8). **Manter em sincronia** |
| `types/api.ts` | Tipos espelhando `docs/swagger.yaml` |

### web/customer
- `pages/index.vue`: lista sessões futuras (filtros filme/data, paginação, agrupadas por dia).
- `pages/sessao.vue` (`?id=`): mapa de ocupação com refresh a cada 20 s e em `visibilitychange`; seleção ≤6; `POST /reservations`; trata 401 (ida e volta pelo login), `conflictingSeats` e erro genérico visível no card.
- `pages/reserva.vue` (`?id=`, auth): contagem regressiva até `expiresAt`, confirmar pagamento, cancelar (prazo calculado no browser).
- `pages/minhas-reservas.vue` (auth), `entrar.vue`, `cadastro.vue` (register + login automático).
- `components/SessionCard.vue`, `ReservationStatus.vue`, `composables/useCountdown.ts`, `layouts/default.vue`.
- `nuxt.config.ts`: porta 3100, devProxy `/api` → `${API_PROXY_TARGET ?? 'http://localhost:3000'}/api`, prerender das 6 rotas.

### web/admin
- `middleware/auth.global.ts`: protege tudo exceto `/entrar`; no primeiro carregamento faz redirect com reload completo (troca de layout na hidratação quebra).
- `pages/index.vue` (sessões, `includePast`), `filmes.vue`, `salas.vue` (criar sala com prévia "A1 a …"), `sala.vue` (`?id=`; editor de flags manutenção/acessível com rascunho, `PATCH /theaters/:id/seats`), `entrar.vue`.
- `components/SessionForm.vue` (data/hora digitadas no fuso de Brasília → `toNetworkIso`; mostra "sala ocupada até"), `ConfirmDelete.vue`.
- `nuxt.config.ts`: porta 3101, `apiBase='/api/admin'`, devProxy → `${API_PROXY_TARGET ?? 'http://localhost:3001'}/api`, `noindex`.

### Testes (`api/test`)
- **Unit**: `booking/` (reservation, occupancy), `catalog/` (seat-map, session), `identity/` (login, register, jwt; `fakes.ts`), `shared/` (`openapi-contract.test.ts`, `pg-error-translator.test.ts`, `problem-details.test.ts`).
- **Integration**: `auth`, `catalog`, `booking` (inclui concorrência: 10 clientes no mesmo assento → exatamente 1 vence; conjuntos sobrepostos sem reserva parcial), `migrations` (constraints, grants, down).
- `integration/support/database.ts`: `startTestDatabase()` usa Testcontainers `postgres:18`, ou, com `TEST_DATABASE_URL`, cria `cinemotion_test_<uuid>` num PG18 existente e dropa ao final. `rolePool` conecta com `-c role=cinemotion_*` para testar os grants reais.

## Data Flow

### Criar reserva (o caminho crítico)

```mermaid
sequenceDiagram
    participant W as sessao.vue
    participant R as booking/http/routes
    participant U as bookingUseCases.reserve
    participant DB as PostgreSQL

    W->>R: POST /api/reservations {sessionId, seatIds} + Bearer
    R->>R: requireAuth + zod (1–6 UUIDs, sem repetidos)
    R->>U: reserve(userId, input)
    U->>DB: BEGIN
    U->>DB: SELECT * FROM lock_session_for_booking(id)  (FOR SHARE)
    U->>DB: SELECT now()  → recusa se now() >= starts_at
    U->>DB: expireOverdue(session): pending vencidas → expired, released_at = expires_at
    U->>DB: findSeats(theater, seatIds) → seats-not-in-session / seat-under-maintenance
    U->>DB: INSERT reservation (expires_at = now()+10min) + INSERT reservation_seat (unnest)
    alt 23505 em ux_reservation_seat_session_id_seat_id
        DB-->>U: unique violation → ROLLBACK
        U->>DB: findTakenSeats (no pool, fora da transação)
        U-->>W: 409 seat-already-taken {conflictingSeats}
    else ok
        U->>DB: COMMIT
        U-->>W: 201 + Location, reserva pending
    end
```

### Confirmar / cancelar
1. Transação + `lockReservation` (`FOR UPDATE OF r`). Reserva de outro cliente → 404 `reservation-not-found`, para não revelar que existe.
2. `decideConfirmation` / `decideCancellation` sobre o **status efetivo** e o `now()` do banco.
3. Confirmar: `status='confirmed'`, assentos continuam presos. Cancelar: `status='cancelled'` + `released_at=now()` nos assentos (liberam na hora). Ambos idempotentes.

### Login com assentos selecionados (front do cliente)

```mermaid
sequenceDiagram
    participant S as /sessao?id
    participant L as /entrar
    participant API

    S->>S: Reservar sem login (ou recebe 401)
    S->>L: /entrar?redirect=/sessao?id=X&assentos=a,b
    L->>API: POST /auth/login
    L->>S: navega para o redirect
    S->>S: carrega o mapa, limpa a query, mantém só assentos ainda livres
    alt todos ainda livres
        S->>API: POST /reservations (automático) → /reserva?id
    else algum foi tomado
        S->>S: toast "Confira a seleção e clique em Reservar"
    end
```

### Mapa de ocupação
`GET /sessions/:id/seats` é público e só lê: junta todos os assentos da sala com `LEFT JOIN LATERAL` no `ACTIVE_HOLD`. Pendentes vencidas aparecem livres sem nenhum UPDATE.

## Conventions

- **ESM** com imports terminando em `.js`; TypeScript estrito (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`).
- **Ports & adapters** por módulo; repositórios são fábricas `(db: Queryable) => Repo`, usadas com `repo(pool)` ou `repo(client)`.
- **Erros**: regra de domínio lança `DomainError`; HTTP converte por `kind`. Handlers Express 5 não têm try/catch (rejeições vão para o `errorHandler`).
- **Tempo**: `now()` do banco dentro da transação para todas as regras. Colunas `timestamptz`; respostas em ISO UTC (`Z`); entrada exige offset explícito; front formata em `America/Sao_Paulo`.
- **Nomes de constraints são contrato** com o tradutor de erros.
- **OpenAPI** (`docs/swagger.yaml`) precisa listar exatamente as rotas Express (teste de contrato).
- **Front**: busca de dados só no browser (`useAsyncData(..., {server:false})`); ids pela query string (`?id=`), nada de rotas dinâmicas; UI depende de auth embrulhada em `ClientOnly`.
- **Idioma**: código em inglês; comentários, mensagens de erro, docs e commits em português. Glossário em `GLOSSARY.md` (evite "ingresso", "booking", "horário"; use Venda, Reserva, Sessão).
- **Git**: git flow (`main`/`develop`/`feature/*`), Conventional Commits em português, tags SemVer sem prefixo.

## Gotchas

- **Nunca filtre por `reservation.status` sozinho.** A expiração é preguiçosa (ADR 0001): linhas `pending` vencidas ficam no banco até alguém reservar naquela mesma sessão. Use a regra `ACTIVE_HOLD` / `effectiveStatus`.
- `expireOverdue` só roda dentro de `reserve`, e só para a sessão sendo reservada. É isso que mantém o índice parcial correto.
- `findTakenSeats` roda depois do rollback, fora da transação, então a lista de `conflictingSeats` pode estar levemente defasada.
- O papel cliente não pode `FOR SHARE` em `session`; use sempre `lock_session_for_booking`. O `FOR SHARE` da reserva e o `FOR UPDATE` do admin se excluem.
- Tradutor de erros pg (`api/src/shared/http/pg-error-translator.ts`):

  | SQLSTATE | Constraint / condição | Resultado |
  |---|---|---|
  | 23505 | `ux_reservation_seat_session_id_seat_id` | 409 `seat-already-taken` |
  | 23505 | `ux_theater_name` / `ux_app_user_email` / `ux_seat_theater_row_number` | 409 `theater-name-taken` / `email-taken` / `seat-duplicated` |
  | 23P01 | `session_no_overlap` | 409 `session-overlap` |
  | 23001, ou 23503 com "is still referenced" | RESTRICT | 409 `in-use` |
  | 23503 | `reservation_app_user_fk` | 401 `invalid-token` (usuário do token não existe mais) |
  | 23503 | outra | 404 `not-found` |
  | 23514, 23502, 22P02, 22001, 22003 | check, not null, etc. | 400 `validation-error` |
  | outro | — | 500 `internal-error` genérico |

  Um comentário na migration fala do prefixo `ck_` como contrato, mas o tradutor não diferencia checks.
- JWT não consulta o banco: sem revogação; usuário apagado só é pego na FK ao reservar.
- `ends_at` da sessão é congelado; mudar a duração do filme não propaga até reagendar.
- Confirmação é aceita mesmo com a sessão já iniciada, desde que dentro dos 10 min.
- Pool com `max: 1` por Lambda (`DB_POOL_MAX`), limitado por reserved concurrency (sem RDS Proxy).
- **PostgreSQL 18 obrigatório** (`uuidv7()` nativo).
- `npm run db:reset -w api` **dropa** o banco de `MIGRATION_DATABASE_URL`.
- WSL: Testcontainers pode travar porque as portas do Docker não chegam ao localhost; use `TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres`.
- Sites: com `API_PROXY_TARGET` definido, cliente e admin usam o mesmo valor; rode cada um com seu env. Admin e cliente compartilham a chave `cinemotion:token`, mas ficam isolados por estarem em domínios diferentes.
- `web/shared/app/utils/rules.ts` duplica constantes da API.
- `docs/model/model.sql` (pgModeler) diverge das migrations (ex.: typo `is_acessible`); a fonte do schema são as migrations.
- `infra/` ainda está vazio (só `.gitkeep`); não há CI.

## Navigation Guide

**Adicionar endpoint na API**: caso de uso em `api/src/modules/<mod>/application/`, schema zod em `http/schemas.ts` (ou inline), rota em `http/routes.ts`, presenter se houver datas; **documentar em `docs/swagger.yaml`** (senão `openapi-contract.test.ts` falha); requests em `http/cinemotion.http` e na coleção Postman; teste de integração em `api/test/integration/`.

**Nova regra de negócio**: função pura em `domain/` + teste em `api/test/unit/<mod>/`; se o front também mostra o limite, atualizar `web/shared/app/utils/rules.ts`.

**Mudar o schema**: nova migration `api/migrations/000N_*.sql` (nunca editar a 0001); ajustar grants dos papéis; se criar constraint mapeável, atualizar `pg-error-translator.ts` e seu teste; ajustar `seeds/seed.sql`; `npm run db:migrate -w api`.

**Novo código de erro**: `DomainError(kind, '<code>', msg, details)` no domínio/aplicação; documentar em `docs/swagger.yaml` e na tabela de erros de `docs/decisoes_tecnicas.md`/README.

**Mexer em autenticação**: `api/src/modules/identity/` (JWT em `infrastructure/jwt-token-service.ts`, middleware em `http/require-auth.ts`); front em `web/shared/app/composables/useAuth*.ts`, `middleware/auth.ts`, `web/admin/app/middleware/auth.global.ts`.

**Nova página no site**: `web/<site>/app/pages/*.vue`; se for de item, use `?id=` e adicione a rota ao `nitro.prerender.routes` do `nuxt.config.ts`; componentes reutilizáveis entre sites vão em `web/shared/app/components/`.

**Tipos do front**: `web/shared/app/types/api.ts` (importar via `#api`), mantendo em linha com o swagger.

**Infra / deploy**: `infra/` (OpenTofu, a escrever); ordem planejada: `npm run db:migrate -w api` com credencial de owner, depois `tofu apply`. Lambdas recebem só `DATABASE_URL` e `JWT_SECRET`.

## Comandos rápidos

```bash
npm install && cp api/.env.example api/.env
docker compose up -d                 # PG18 (POSTGRES_PORT=5433 se 5432 estiver ocupada)
npm run db:reset -w api              # DROP + migrations + senhas dev + seed (senha dos usuários: Senha@123)
npm run dev -w api                   # :3000/api e :3001/api/admin
npm run dev:customer                 # :3100
npm run dev:admin                    # :3101
npm test -w api                      # ou TEST_DATABASE_URL=... npm test -w api no WSL
npm run typecheck -w api && npm run typecheck:web
npm run build:web                    # saída em web/*/.output/public
```
