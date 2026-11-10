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
- Região `us-east-1`, a mesma do RDS. O RDS (PostgreSQL 18) é público, e as Lambdas ficam **fora da VPC**: sem NAT nem VPC endpoints, que custariam mais que o projeto inteiro. A conexão usa `sslmode=verify-full`, com a CA da Amazon carregada por `NODE_EXTRA_CA_CERTS=/var/runtime/ca-cert.pem`.
- **Segredos:** a `DATABASE_URL` de cada role fica num parâmetro SecureString do SSM (`/cinemotion/<api>/database-url`), criado fora do repositório. O OpenTofu lê o parâmetro e o passa como variável de ambiente da Lambda, que não acessa o SSM em tempo de execução. Os `JWT_SECRET` são gerados pelo próprio OpenTofu (`random_password`), um por API.
- **State local** do OpenTofu, fora do git. Como ele contém os segredos, não é compartilhado. Um backend S3 só se justificaria com mais de uma pessoa ou com pipeline fazendo deploy.
- Os sites são enviados ao S3 pelo próprio `tofu apply`. Os arquivos com hash no nome ficam em cache por um ano, e o resto é servido com `max-age=0`, por isso o deploy não precisa invalidar o CloudFront.

### APIs

- **Um repositório e um código só, com dois handlers.** O build gera um único artefato. O OpenTofu cria duas Lambdas a partir dele, mudando apenas o `handler` (`customer` / `admin`), e cada handler monta só as rotas do seu papel. O domínio, as migrations e o tradutor de erros existem em uma cópia só.
- Cada API é uma Lambda própria, atrás do **seu próprio API Gateway HTTP API**, com throttling e logs no CloudWatch separados.
- **Cada API responde no domínio do seu frontend, sob `/api`.** A do cliente fica em `/api` (`/api/sessions`, `/api/auth/login`) e a do admin em `/api/admin` (`/api/admin/sessions`), inclusive localmente nas portas 3000 e 3001. Na AWS, a distribuição CloudFront de cada site encaminha `/api/*` ao API Gateway da sua API; no ambiente local, o `devProxy` do Nuxt faz o mesmo. Assim o navegador chama a API na mesma origem da página: **não há CORS**, o build do site não depende da URL do API Gateway, e as duas APIs não repetem caminhos, o que permite um único documento OpenAPI.
- **Um único documento OpenAPI 3.2.0, em `docs/swagger.yaml`**, cobrindo as duas APIs (os caminhos `/api/admin` apontam para o servidor da 3001, e as tags hierárquicas da 3.2 agrupam cada API). Ele não é servido pelas Lambdas: um gerador de documentação compila `docs/` + `README.md` + o swagger num site estático publicado no S3, com o Swagger UI atual (que suporta a 3.2). Uma checagem compara as rotas do Express com os caminhos do documento. A collection `.http` tem uma seção por API.

### Conexões com o banco

- `pg.Pool` com `max: 1` por instância de Lambda, criado fora do handler.
- *Reserved concurrency* limitado em cada Lambda (ex.: 20 na cliente, 5 na admin), para não esgotar as conexões do Postgres. A conta atual tem limite de 10 execuções simultâneas e não aceita reserva, então hoje esse limite da conta é o teto (10 conexões somando as duas APIs). A reserva é uma variável do OpenTofu, para quando a cota aumentar.
- Sem RDS Proxy, por custo.

### Frontends

- **Dois projetos Nuxt** no mesmo repositório (`web/customer` e `web/admin`), compartilhando componentes por uma pasta comum. Assim nenhuma página do admin entra no HTML estático público do cliente.
- Nuxt SSG servido do S3 através do CloudFront, que dá HTTPS mesmo sem domínio próprio.
- Nuxt 4 + **Nuxt UI 4** + Tailwind 4. A camada comum (`web/shared`) é um layer do Nuxt que os dois sites estendem: cliente HTTP (`useApi`), sessão (`useAuth`), formatação de datas no fuso da rede, leitura do Problem Details e o componente do mapa de assentos, usado na escolha do cliente e na edição da Sala.
- **Os dados vêm da API no navegador**, nunca no `nuxt generate`: o build não depende da API estar no ar. Páginas de um item recebem o id pela query (`/sessao?id=…`, `/sala?id=…`), porque o site é gerado sem conhecer os ids; assim não há rotas dinâmicas nem regra de reescrita no CloudFront.
- **Token Bearer no `localStorage`**, com o instante de expiração. Cookie httpOnly exigiria a API emitir e ler cookies, além de proteção contra CSRF; com sites estáticos sem scripts de terceiros e token de 1 hora, o `localStorage` é suficiente para o escopo. Resposta 401 descarta o token.
- **Datas digitadas no fuso da rede:** o formulário de Sessão converte dia e hora para ISO 8601 com o offset de `America/Sao_Paulo` naquele instante (via `Intl`), independentemente do fuso do navegador.
- No admin, todas as páginas exigem login. Quando o primeiro carregamento cai numa página protegida sem sessão, o redirecionamento para `/entrar` recarrega a página: trocar de layout durante a hidratação do HTML pré-renderizado deixaria a tela de login com o layout errado.
- **Duas distribuições CloudFront**, uma por frontend, cada uma com seu bucket. Em cada uma, `/api/*` vai para o API Gateway da API correspondente e o resto vem do S3.

## Banco de dados

- **Migrations versionadas com `node-pg-migrate`**, em SQL puro (`api/migrations/0001_init.sql`, ...). A primeira migration parte do `model.sql` e inclui os roles da aplicação. Toda mudança de schema posterior vira uma migration nova.
- A `0001` corrige o que o export do pgModeler ainda tinha de errado: a grafia `is_accessible`, a FK composta `reservation_seat (reservation_id, session_id) → reservation (id, session_id)` (o assento retido pertence à mesma Sessão da Reserva), a unicidade de fileira/número por Sala (`ux_seat_theater_row_number`), a duração positiva do Filme e o prefixo `ck_` no check de preço.
- Os roles `cinemotion_admin` e `cinemotion_customer` são criados **sem senha**. A senha é definida fora do repositório (`ALTER ROLE ... PASSWORD`). O `db:reset` define senhas de desenvolvimento só no banco local.
- O pgModeler (`docs/model/`) passa a ser só o diagrama de referência, e não a fonte do schema.
- O seed fica separado das migrations (`api/seeds/seed.sql`). `npm run db:reset -w api` recria o banco local, aplica as migrations e o seed.
- No deploy, as migrations rodam num passo explícito (`npm run db:migrate -w api`) **antes** do `tofu apply`, da máquina local, com uma credencial de *owner* separada dos roles da aplicação. As Lambdas nunca migram o banco.
- As chaves primárias usam `uuidv7()`, nativo apenas no **PostgreSQL 18**. Se o banco da AWS for de outra versão, isso é ajustado no deploy.
- Todo horário é gravado em `timestamptz`.

## Regras de domínio e como são garantidas

### Venda nunca duplicada (concorrência)

- O índice único parcial `ux_reservation_seat_session_id_seat_id (session_id, seat_id) WHERE released_at IS NULL` é **a** garantia de que um Assento não fica em duas Reservas ativas.
- A Reserva é criada numa única transação que insere todos os assentos de uma vez, sem `SELECT ... FOR UPDATE` prévio. Se algum assento já estiver ocupado, a transação inteira é desfeita ("todos ou nenhum").
- A transação trava a Sessão com `FOR SHARE`, para que o Administrador não a edite no meio da reserva. Como `FOR SHARE` exige privilégio de `UPDATE` e o role do Cliente só lê o catálogo, o lock é feito pela função `lock_session_for_booking` (migration `0002`, `SECURITY DEFINER`, com `EXECUTE` só para `cinemotion_customer`).
- Na violação de unicidade, a API responde **409** com a lista completa dos assentos em conflito (`conflictingSeats`). Como o Postgres informa só o primeiro, essa lista vem de uma consulta feita depois do rollback.
- Um teste de integração dispara 10 requisições simultâneas, de clientes diferentes, para o mesmo assento, e verifica que exatamente uma é aceita. Outro dispara pedidos com assentos sobrepostos e verifica que os perdedores não deixam retenção parcial. Sem o índice único parcial, os dois falham. Ele roda contra um PostgreSQL 18 descartável criado pelo **Testcontainers**, com as migrations aplicadas.
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
- As respostas usam ISO 8601 em UTC (`2030-01-01T22:00:00.000Z`), e o frontend formata no fuso da rede. As entradas exigem fuso explícito (`2030-01-01T19:00:00-03:00`): data/hora sem offset é recusada, para não ficar ambígua. Ver [ADR 0002](./adr/0002-datas-em-utc-formatadas-no-frontend.md).

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

### Reservas (API do Cliente)

- `GET /sessions/:id/seats` (público): mapa de ocupação com o estado de cada Assento (`available`, `reserved`, `sold`, `unavailable`) e um resumo das contagens.
- `POST /reservations` `{ sessionId, seatIds }`, além de `GET /reservations`, `GET /reservations/:id`, `POST /reservations/:id/confirm` e `POST /reservations/:id/cancel`. Todas exigem token de cliente.
- Os Assentos são identificados por id na entrada, e as respostas trazem também o rótulo (`A1`). A Reserva traz o `total` (preço da Sessão × assentos).
- **Confirmar e cancelar são idempotentes:** repetir devolve a Reserva no estado atual, sem erro, para que um retry do pagamento não quebre.
- Reserva de outro Cliente responde 404, sem revelar que ela existe.
- Na expiração preguiçosa, o `released_at` dos assentos recebe o `expires_at` da Reserva (o instante real em que venceram), e não o momento em que a limpeza rodou.

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

Erros de reserva:
- 409: `seat-already-taken` (com `conflictingSeats`), `seat-under-maintenance` (com `seats`), `session-already-started`, `reservation-expired`, `reservation-cancelled` e `cancellation-deadline-passed` (com `deadline`).
- 400: `seats-not-in-session` (assento de outra Sala, com `invalidSeats`) e `validation-error` (mais de 6 assentos ou assento repetido).
- 404: `reservation-not-found` e `session-not-found`.

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
- Pipeline de deploy (GitHub Actions): o deploy é manual (`npm run db:migrate -w api` + `tofu apply`). O pipeline é um diferencial opcional, se houver tempo.
