# Revisão do modelo — `model.sql`

> Revisão feita em 06/11/2026 sobre o `model.sql` gerado pelo pgModeler 2.0 (PostgreSQL 18), comparado com o escopo em `docs/Desafio Técnico.md`.

Legenda de prioridade:

- 🔴 **Crítico**: quebra uma regra de negócio do desafio ou a garantia de concorrência.
- 🟠 **Importante**: integridade de dados, campos exigidos pelo escopo.
- 🟢 **Melhoria**: padronização, legibilidade, desempenho.

---

## 1. Como fazer no pgModeler

### 1.1 `NOT NULL` em coluna criada por relacionamento (`seat.theater_id`, `session.movie_id` etc.)

O pgModeler bloqueia a edição de colunas que foram geradas por um **relacionamento**. A configuração fica no próprio relacionamento:

1. Dê duplo clique na **linha do relacionamento** no diagrama (não na tabela).
2. Na aba **General**, marque a opção **mandatory** da tabela referenciada (ex.: *theater is mandatory*). Isso transforma a FK em `NOT NULL`.
3. Na mesma tela ficam **ON DELETE** / **ON UPDATE**. Ajuste-os ali também.

### 1.2 `CHECK` em coluna (`seat.number`, `movie.duration`, `session.price`...)

`CHECK` não fica no formulário da coluna. Ele é uma **constraint da tabela**:

1. Abra a tabela → aba **Constraints** → botão **+**.
2. *Constraint type*: **CHECK**.
3. *Expression*: por exemplo `number BETWEEN 1 AND 99`, sem o `CHECK` e sem parênteses externos.
4. Dê um nome, ex.: `ck_seat_number`.

### 1.3 `numeric(10,2)`

O tipo não aparece escrito como `numeric(10,2)` no combo:

1. Em *Type*, selecione (ou digite) **`numeric`**.
2. Preencha **Length = 10** e **Precision = 2**. O campo *Precision* só é habilitado para `numeric`/`decimal`.

Não use `float` para dinheiro: ele é binário e aproximado (`0.1 + 0.2 ≠ 0.3`).

### 1.4 `INCLUDE` duplicado nos índices

Todos os índices saíram com `INCLUDE (...)` repetindo as colunas da chave. O pgModeler preenche isso quando a coluna é adicionada na lista de *included columns*. No formulário do índice, aba **Elements**, deixe a lista de colunas incluídas **vazia**.

### 1.5 `EXCLUDE` e extensão (opcional)

O *Appended SQL* que você usou em `session` funciona. Se preferir fazer de forma "nativa":

- A extensão pode ser criada como objeto **Extension** (`btree_gist`) no schema.
- O pgModeler tem constraint do tipo **EXCLUDE** na aba *Constraints* (método `gist`, elementos com operadores `=` e `&&`).

Na migration do EF Core isso vai como `migrationBuilder.Sql(...)` de qualquer forma.

---

## 2. Revisão por tabela

### `movie`

| Prioridade | Item | Atual | Recomendado |
|---|---|---|---|
| 🟠 | Nome do filme | `movie varchar(326)` nulo | `title varchar(200) NOT NULL` |
| 🟠 | Duração | `duration int4` nulo, sem check | `duration int4 NOT NULL` + `CHECK (duration > 0)` |

A regra de sobreposição de sessões depende de `duration`, por isso ela não pode ser nula.

### `theater`

| Prioridade | Item | Atual | Recomendado |
|---|---|---|---|
| 🟢 | Índice único | `UNIQUE (name) INCLUDE (name)` | remover o `INCLUDE` |

### `seat`

| Prioridade | Item | Atual | Recomendado |
|---|---|---|---|
| 🟠 | Sala obrigatória | `theater_id uuid` nulo | `NOT NULL` (ver 1.1) |
| 🟠 | Acessibilidade (exigido no escopo) | não existe | `is_accessible boolean NOT NULL DEFAULT false` |
| 🟠 | Faixa do número | só comentário `1 - 99` | `CHECK (number BETWEEN 1 AND 99)` |
| 🟢 | Formato da fileira | livre | `CHECK ("row" ~ '^[A-Z]{1,2}$')` |
| 🟢 | Nome `row` | palavra reservada, exige aspas | renomear para `seat_row` |
| 🟢 | Índice único | `INCLUDE (theater_id,"row",number)` | remover o `INCLUDE` |

> O escopo diz: *"Alguns assentos podem ser marcados como indisponíveis (manutenção) **ou acessíveis**"*. Acessível e em manutenção são independentes, por isso use um `boolean` separado, não um valor novo no enum.

### `session`

| Prioridade | Item | Atual | Recomendado |
|---|---|---|---|
| 🔴 | Fim da sessão | `ends_at timestamptz` nulo | `NOT NULL` |
| 🟠 | Filme e sala | `movie_id`, `theater_id` nulos | `NOT NULL` (ver 1.1) |
| 🟠 | Preço | `price float` nulo | `numeric(10,2) NOT NULL` + `CHECK (price >= 0)` |

> 🔴 Se `ends_at` for `NULL`, `tstzrange(starts_at, NULL)` vira um intervalo **infinito**, e a sessão bloqueia a sala para sempre. Além disso, `CHECK (ends_at > starts_at)` com `NULL` é considerado **verdadeiro**, então o check não pega o problema. `ends_at` = `starts_at + duration + 15 min` é calculado pela aplicação.

A `EXCLUDE` e o `CHECK` no *Appended SQL* estão corretos ✅. As FKs com `RESTRICT` também ✅.

### `app_user` / `admin_user`

| Prioridade | Item | Atual | Recomendado |
|---|---|---|---|
| 🟠 | Duas tabelas de usuário | `app_user` (só `id`) + `admin_user` | **uma tabela** `app_user` com `role` |
| 🟠 | `admin_user` sem PK | sem `PRIMARY KEY` | (some ao unificar) |
| 🔴 | Senha | `password varchar(55)` | `password_hash varchar(255) NOT NULL` |
| 🟠 | E-mail | `varchar(55)`, sem unicidade | `varchar(254) NOT NULL` + índice único |

Sugestão:

```sql
CREATE TYPE public.user_role AS ENUM ('admin', 'customer');

CREATE TABLE public.app_user (
    id            uuid         NOT NULL DEFAULT uuidv7(),
    email         varchar(254) NOT NULL,
    password_hash varchar(255) NOT NULL,
    role          public.user_role NOT NULL DEFAULT 'customer',
    created_at    timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT app_user_pk PRIMARY KEY (id)
);
CREATE UNIQUE INDEX ux_app_user_email ON public.app_user (lower(email));
```

- O escopo pede **JWT com dois perfis** (administrador e cliente). Um campo `role` na mesma tabela vira uma *claim* no token e simplifica login e autorização (`[Authorize(Roles = "admin")]`).
- **Nunca guarde a senha em texto.** Guarde o hash (`PasswordHasher<T>` do ASP.NET Identity, BCrypt ou Argon2). Esses hashes têm 60 a 100+ caracteres, por isso `varchar(55)` não cabe.
- O índice em `lower(email)` evita `Joao@x.com` e `joao@x.com` como contas diferentes.

### `reservation`

| Prioridade | Item | Atual | Recomendado |
|---|---|---|---|
| 🔴 | Prazo de expiração | `expired_at` nulo | `expires_at timestamptz NOT NULL` (= `created_at + 10 min`) |
| 🟠 | Usuário e sessão | nulos, FK `ON DELETE SET NULL` | `NOT NULL`, `ON DELETE RESTRICT` |
| 🟠 | Alvo da FK composta | não existe | `UNIQUE (id, session_id)` |

`expires_at` é o **prazo**, não o momento em que expirou. Sem esse campo obrigatório, a regra dos 10 minutos não tem como ser verificada.

### `reservation_seat`

| Prioridade | Item | Atual | Recomendado |
|---|---|---|---|
| 🔴 | `released_at` | `NOT NULL DEFAULT CURRENT_TIMESTAMP` | `timestamptz NULL`, **sem default** |
| 🔴 | Índice de concorrência | `CREATE INDEX` (não é único) | `CREATE UNIQUE INDEX` |
| 🟠 | FKs | colunas nulas, `ON DELETE SET NULL` | `NOT NULL`; `reservation_id` → `CASCADE`, `seat_id`/`session_id` → `RESTRICT` |
| 🟠 | Consistência da sessão | FK simples para `session` | FK composta `(reservation_id, session_id)` → `reservation (id, session_id)` |
| 🟢 | Assento repetido na mesma reserva | permitido | `UNIQUE (reservation_id, seat_id)` |
| 🟢 | Índice | `INCLUDE (session_id,seat_id)` | remover o `INCLUDE` |

> 🔴 **Os dois primeiros itens anulam a proteção contra venda dupla:**
> - Com `released_at` sempre preenchido, nenhuma linha satisfaz `WHERE released_at IS NULL`, e o índice fica vazio.
> - Com o índice não-único, mesmo que tivesse linhas, ele não impediria duplicatas.

Resultado esperado:

```sql
CREATE TABLE public.reservation_seat (
    id             uuid        NOT NULL DEFAULT uuidv7(),
    reservation_id uuid        NOT NULL,
    session_id     uuid        NOT NULL,
    seat_id        uuid        NOT NULL,
    released_at    timestamptz NULL,
    CONSTRAINT reservation_seat_pk PRIMARY KEY (id),
    CONSTRAINT uq_reservation_seat UNIQUE (reservation_id, seat_id),
    CONSTRAINT reservation_fk FOREIGN KEY (reservation_id, session_id)
        REFERENCES public.reservation (id, session_id) ON DELETE CASCADE,
    CONSTRAINT seat_fk FOREIGN KEY (seat_id)
        REFERENCES public.seat (id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX ux_reservation_seat_session_id_seat_id
    ON public.reservation_seat (session_id, seat_id)
    WHERE released_at IS NULL;
```

A FK composta para `reservation` já garante que `session_id` existe e é o mesmo da reserva, então a FK simples `reservation_seat.session_id → session` vira redundante. Pode manter, mas não é necessária.

---

## 3. Itens gerais

- 🟢 **`ON UPDATE CASCADE` em PKs UUID** não tem efeito prático (PKs não são alteradas). Pode deixar `NO ACTION`.
- 🟢 **`MATCH FULL`** só faz diferença em FKs compostas com colunas nulas. Com as colunas `NOT NULL`, é indiferente.
- 🟢 **Nomes de constraint repetidos** (`theater_fk` em `seat` e em `session`, `session_fk` em `reservation` e `reservation_seat`) são permitidos, porque o nome é por tabela. Mas nomes como `fk_seat_theater` e `fk_session_theater` deixam as mensagens de erro e os logs mais claros.

---

## 4. Checklist

### 🔴 Crítico
- [ ] `reservation_seat.released_at` → nulo e sem default
- [ ] Índice `ux_reservation_seat_session_id_seat_id` → **UNIQUE**
- [ ] `session.ends_at` → `NOT NULL`
- [ ] `reservation.expired_at` → `expires_at NOT NULL`
- [ ] Senha → `password_hash`

### 🟠 Importante
- [ ] `movie.title` e `movie.duration` → `NOT NULL` + `CHECK (duration > 0)`
- [ ] `seat.theater_id` → `NOT NULL`
- [ ] `seat.is_accessible`
- [ ] `seat`: `CHECK (number BETWEEN 1 AND 99)`
- [ ] `session.movie_id`, `session.theater_id` → `NOT NULL`
- [ ] `session.price` → `numeric(10,2) NOT NULL` + `CHECK (price >= 0)`
- [ ] Unificar `app_user` + `admin_user` com `role`; e-mail único
- [ ] `reservation.app_user_id`, `reservation.session_id` → `NOT NULL`, `RESTRICT`
- [ ] `reservation`: `UNIQUE (id, session_id)` + FK composta em `reservation_seat`
- [ ] FKs de `reservation_seat` → `NOT NULL` e ações corretas

### 🟢 Melhoria
- [ ] Remover `INCLUDE` de todos os índices
- [ ] `seat.row` → `seat_row` + `CHECK` de formato
- [ ] `UNIQUE (reservation_id, seat_id)`
- [ ] Padronizar nomes de constraints
