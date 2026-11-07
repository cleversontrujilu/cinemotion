# Decisões Técnicas

Vocabulário do domínio: [`GLOSSARY.md`](../GLOSSARY.md). Decisões arquiteturais com trade-off registrado: [`docs/adr/`](./adr/).

## Stack

| Camada | Escolha |
|---|---|
| API | Node.js + Express.js, organizada segundo os preceitos de DDD |
| Execução da API | AWS Lambda, com o Express adaptado por `serverless-http` |
| Frontend | Nuxt (SSG), hospedado como site estático no AWS S3 |
| CSS | Tailwind CSS |
| Banco de dados | PostgreSQL |

**Justificativa:** a stack da empresa é C# (.NET) + Angular. Optei por Node.js e Nuxt por familiaridade com a linguagem, o que permite focar nas regras de negócio e na garantia de concorrência dentro do prazo.

**Ambientes:** há dois ambientes, cada um com **sua própria API** (deploy separado) e seu próprio frontend:
- **Cliente**: cadastro, consulta de sessões e mapa de ocupação, reservas, confirmação e cancelamento.
- **Administrador**: gestão de Salas, Filmes e Sessões.

## Deploy e versionamento

- Infraestrutura na AWS, em conta própria que já tem um banco PostgreSQL disponível.
- Infraestrutura como código com **OpenTofu**.
- Código versionado no **GitHub**, em repositório público.
- Sem domínio próprio. Tudo usa as URLs padrão da AWS (`*.execute-api...` e `*.cloudfront.net`).

### APIs

- **Um repositório e um código só, com dois handlers.** O build gera um único artefato. O OpenTofu cria duas Lambdas a partir dele, mudando apenas o `handler` (`customer` / `admin`), e cada handler monta só as rotas do seu papel. O domínio, as migrations e o tradutor de erros existem em uma cópia só.
- Cada API é uma Lambda própria, atrás do **seu próprio API Gateway HTTP API**, com URL, CORS, throttling e logs no CloudWatch separados.
- Cada API publica sua documentação OpenAPI em `/docs` e `/openapi.json`. A collection `.http` tem uma seção por API.
- O CORS de cada API aceita apenas a origem do seu frontend.

### Conexões com o banco

- `pg.Pool` com `max: 1` por instância de Lambda, criado fora do handler.
- *Reserved concurrency* limitado em cada Lambda (ex.: 20 na cliente, 5 na admin), para não esgotar as conexões do Postgres.
- Sem RDS Proxy, por custo.

### Frontends

- **Dois projetos Nuxt** no mesmo repositório (`web/customer` e `web/admin`), compartilhando componentes por uma pasta comum. Assim nenhuma página do admin entra no HTML estático público do cliente.
- Nuxt SSG servido do S3 através do CloudFront, que dá HTTPS mesmo sem domínio próprio.
- **Duas distribuições CloudFront**, uma por frontend, cada uma com seu bucket. Cada API aceita no CORS apenas o domínio `*.cloudfront.net` do seu frontend.

## Banco de dados

- **Migrations versionadas com `node-pg-migrate`**, em SQL puro (`api/migrations/0001_init.sql`, ...). A primeira migration parte do `model.sql` e inclui os roles da aplicação. Toda mudança de schema posterior vira uma migration nova.
- A `0001` corrige o que o export do pgModeler ainda tinha de errado: a grafia `is_accessible`, a FK composta `reservation_seat (reservation_id, session_id) → reservation (id, session_id)` (o assento retido pertence à mesma Sessão da Reserva), a unicidade de fileira/número por Sala (`ux_seat_theater_row_number`), a duração positiva do Filme e o prefixo `ck_` no check de preço.
- Os roles `cinemotion_admin` e `cinemotion_customer` são criados **sem senha**. A senha é definida fora do repositório (`ALTER ROLE ... PASSWORD`). O `db:reset` define senhas de desenvolvimento só no banco local.
- O pgModeler (`docs/model/`) passa a ser só o diagrama de referência, e não a fonte do schema.
- O seed fica separado das migrations (`api/seeds/seed.sql`). `npm run db:reset -w api` recria o banco local, aplica as migrations e o seed.
- No deploy, as migrations rodam num passo explícito (`npm run migrate`) **antes** do `tofu apply`, da máquina local, com uma credencial de *owner* separada dos roles da aplicação. As Lambdas nunca migram o banco.
- As chaves primárias usam `uuidv7()`, nativo apenas no **PostgreSQL 18**. Se o banco da AWS for de outra versão, isso é ajustado no deploy.
- Todo horário é gravado em `timestamptz`.

## Regras de domínio e como são garantidas

### Venda nunca duplicada (concorrência)

- O índice único parcial `ux_reservation_seat_session_id_seat_id (session_id, seat_id) WHERE released_at IS NULL` é **a** garantia de que um Assento não fica em duas Reservas ativas.
- A Reserva é criada numa única transação que insere todos os assentos de uma vez, sem `SELECT ... FOR UPDATE` prévio. Se algum assento já estiver ocupado, a transação inteira é desfeita ("todos ou nenhum").
- Na violação de unicidade, a API responde **409** com a lista completa dos assentos em conflito (`conflictingSeats`). Como o Postgres informa só o primeiro, essa lista vem de uma consulta feita depois do rollback.
- Um teste de integração dispara requisições simultâneas para o mesmo assento e verifica que exatamente uma é aceita. Ele roda contra um PostgreSQL 18 descartável criado pelo **Testcontainers**, com as migrations aplicadas.
- Alternativa sem Docker: com `TEST_DATABASE_URL` apontando para um PostgreSQL 18 já rodando (superusuário), os testes criam um banco temporário nesse servidor e o removem no fim.

### Expiração de Reservas pendentes

Ver [ADR 0001](./adr/0001-expiracao-preguicosa-de-reservas.md). Resumo:
- Não há job agendado, por economia em Lambda.
- Toda leitura trata `pending` com `expires_at <= now()` como expirada.
- A transação de reserva marca como expiradas e libera as reservas vencidas da mesma Sessão antes de inserir.

### Sobreposição de Sessões

- Uma exclusion constraint (`session_no_overlap`, GiST) impede duas Sessões com intervalos sobrepostos na mesma Sala.
- `ends_at` já inclui a duração do Filme mais 15 minutos de limpeza. É calculado na criação da Sessão e não muda se a duração do Filme for alterada depois.

### Tempo

- Toda regra de tempo usa o `now()` do banco, dentro da transação, e nunca o relógio da Lambda. As regras são: prazo de 10 min, Sessão iniciada e limite de 2h para cancelar.
- Nos testes unitários, o relógio é injetado.
- A rede usa um fuso horário único (`America/Sao_Paulo`), definido em configuração (`APP_TIMEZONE`). O filtro "por data" considera o dia nesse fuso.
- As respostas usam ISO 8601 em UTC (`2030-01-01T22:00:00.000Z`), e o frontend formata no fuso da rede. As entradas exigem fuso explícito (`2030-01-01T19:00:00-03:00`): data/hora sem offset é recusada, para não ficar ambígua.

### Limites de tempo exatos

- Sessão futura: `starts_at > now()`.
- Sessão iniciada: `now() >= starts_at`. A partir daí, a Sessão não aceita novas Reservas.
- Cancelamento: permitido até `starts_at - 2h`, inclusive.
- Confirmação: aceita enquanto a Reserva estiver no prazo, mesmo com a Sessão já iniciada.

### Catálogo (Salas, Filmes e Sessões)

- **Leitura pública na API do Cliente** (`GET /movies`, `/theaters`, `/sessions`, `/sessions/:id`), sem token, para dar para navegar antes do login. Toda escrita fica na API admin, com token de admin.
- **Mapa de assentos na criação da Sala:** `{ name, rows, seatsPerRow, accessibleSeats?, maintenanceSeats? }`. As fileiras são A, B, …, Z, AA, … (até 30), com até 99 assentos por fileira. O mapa inteiro entra num único INSERT, na mesma transação da Sala.
- **Marcações:** `PATCH /theaters/:id/seats` com `[{ seat: "A1", accessible?, underMaintenance? }]`. Se algum assento não existir, nada é alterado (400 `unknown-seats`).
- **Listagem de Sessões:** filtros `movieId`, `theaterId`, `date` (YYYY-MM-DD) e paginação `page`/`pageSize` (padrão 20, máximo 100). A resposta traz `{ items, page, pageSize, total, totalPages }`, ordenada pelo início. A API admin aceita `includePast=true`.
- **Preço** em reais, como número com no máximo 2 casas (`numeric(10,2)` no banco).
- **Edição de Sessão contra Reserva concorrente:** editar ou excluir trava a linha da Sessão (`SELECT ... FOR UPDATE`) antes de checar se há Reserva ativa. A transação de Reserva trava a mesma linha com `FOR SHARE`, então as duas operações nunca se cruzam. Reagendar ou trocar o Filme recalcula o fim com a duração atual do Filme.
- Ativa = Venda ou Reserva pendente ainda no prazo. A pendente vencida não bloqueia nada (ADR 0001).

### Alterações depois de criados

- Uma Sessão com Reserva ativa não pode ser editada nem excluída (409).
- O mapa de assentos é imutável. Só mudam as marcações *em manutenção* e *acessível*.
- Um Assento em manutenção não aceita novas Reservas, mas as existentes continuam valendo. No mapa de ocupação, *reservado* e *vendido* prevalecem sobre *indisponível*.

## Erros da API

Os erros seguem Problem Details (RFC 9457). A mensagem crua do Postgres nunca chega ao cliente. Um tradutor central lê `code` e `constraint` do erro:

| SQLSTATE | constraint | HTTP | `type` |
|---|---|---|---|
| 23505 | `ux_reservation_seat_session_id_seat_id` | 409 | `seat-already-taken` |
| 23P01 | `session_no_overlap` | 409 | `session-overlap` |
| 23505 | `ux_theater_name` | 409 | `theater-name-taken` |
| 23505 | `ux_app_user_email` | 409 | `email-taken` |
| 23505 | `ux_seat_theater_row_number` | 409 | `seat-duplicated` |
| 23505 | outro índice único | 409 | `conflict` |
| 23514, 23502, 22P02, 22001, 22003 | `ck_*` / `*_chk` e afins | 400 | `validation-error` |
| 23001 | FK com `ON DELETE RESTRICT` | 409 | `in-use` |
| 23503 | FK (referência inexistente / ainda referenciado) | 404 / 409 | `not-found` / `in-use` |
| outro | — | 500 | genérico, sem detalhes, com log |

O `type` é uma referência relativa `/problems/<código>` (ex.: `/problems/seat-already-taken`), e o corpo sai com `Content-Type: application/problem+json`. Falhas de validação de entrada trazem a lista `errors` (`path`, `message`).

Os nomes das constraints são parte desse contrato e não devem ser renomeados sem atualizar o tradutor.

Erros de autenticação (401): `invalid-credentials` (login), `missing-token` (sem `Authorization: Bearer`) e `invalid-token` (assinatura, audiência ou validade inválidas).

Erros do catálogo: `theater-not-found`, `movie-not-found` e `session-not-found` (404); `unknown-seats` e `session-starts-in-past` (400); `session-has-active-reservations` (409). Remover Sala ou Filme com Sessões, ou Sessão com histórico de Reservas, dá 409 `in-use` (FK `RESTRICT`).

Outros erros de domínio: `reservation-expired` e `reservation-cancelled` (409, ao confirmar), `seat-under-maintenance` (409), e pedidos inválidos (400): mais de 6 assentos, assento repetido ou assento de outra Sala.

## Autenticação

- JWT com dois papéis: `customer` e `admin`. Os usuários ficam numa tabela única (`app_user.role`).
- Cada API tem seu `POST /auth/login` e só emite token para o seu papel.
- O token leva `aud` (`cinemotion-customer` / `cinemotion-admin`), e cada API rejeita tokens da outra audiência.
- `POST /auth/register` existe apenas na API cliente e sempre cria `customer`.
- Administradores existem apenas via seed/migration. Não há endpoint para promover usuários.
- **Um segredo por API** (HS256, com `jose`): na Lambda, `JWT_SECRET`; localmente, `CUSTOMER_JWT_SECRET` e `ADMIN_JWT_SECRET`. Mesmo que um segredo vaze, ele não serve para emitir tokens da outra API. O token leva `sub`, `email`, `role`, `iss` (`cinemotion`), `aud` e `exp` (padrão de 1h, configurável em `JWT_TTL_SECONDS`).
- `GET /auth/me` devolve o usuário do token, nas duas APIs.
- Senhas com bcrypt (`bcryptjs`, em JS puro, sem binário nativo na Lambda), custo 10. Mínimo de 8 caracteres e máximo de 72 bytes, que é o limite do bcrypt.
- O login dá o mesmo erro (`invalid-credentials`) para e-mail inexistente, senha errada e usuário de outro papel. Quando o e-mail não existe, a senha é comparada mesmo assim com um hash descartável, para que o tempo de resposta não revele quais e-mails estão cadastrados.
- Respostas 401 trazem `WWW-Authenticate: Bearer`.

### Separação no banco

- Dois roles no Postgres, cada um usado só pela sua Lambda:
  - `cinemotion_admin` escreve em `theater`, `seat`, `movie` e `session`.
  - `cinemotion_customer` escreve em `reservation`, `reservation_seat` e `app_user` (cadastro), e lê o resto.

## O que ficou de fora

- Reembolso ou cancelamento automático de Vendas quando um assento entra em manutenção.
- Cancelamento de Reservas de Clientes pelo Administrador.
- Limite de assentos por Cliente na Sessão (o limite de 6 vale por Reserva).
- Preço variável por Assento ou por tipo de Cliente (meia-entrada).
- Cinemas em fusos horários diferentes.
- Job de expiração de Reservas (ver ADR 0001).
- RDS Proxy: a concorrência é limitada direto na Lambda.
- Domínio próprio: são usadas as URLs padrão da AWS.
- Pipeline de deploy (GitHub Actions): o deploy é manual (`npm run migrate` + `tofu apply`). O pipeline é um diferencial opcional, se houver tempo.
