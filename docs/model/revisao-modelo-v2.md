# Revisão do modelo — v2

> Segunda revisão do `model.sql` (pgModeler 2.0 / PostgreSQL 18), feita em 06/11/2026.
> Anterior: [`revisao-modelo.md`](./revisao-modelo.md).

Desta vez o script foi **executado** num PostgreSQL 18 temporário (Docker), e o comportamento das regras foi testado com dados de exemplo. Os resultados estão na seção 2.

Legenda: 🔴 crítico · 🟠 importante · 🟢 melhoria · ✅ resolvido

---

## 1. Resumo do avanço

| Item da v1 | Situação |
|---|---|
| `movie.movie` → `title` | ✅ renomeado (ainda nulo, ver 3.1) |
| `theater.name` + índice único | ✅ |
| `seat.theater_id NOT NULL` | ✅ |
| `seat.row` → `seat_row` | ✅ |
| `CHECK` no número do assento | 🔴 criado, mas com erro de sintaxe (ver 3.3) |
| `INCLUDE` duplicado nos índices | ✅ removido |
| `session.movie_id` / `theater_id NOT NULL` | ✅ |
| `session.ends_at NOT NULL` | ✅ |
| `session.price numeric(10,2)` | ✅ tipo certo (ainda nulo, ver 3.4) |
| `EXCLUDE` contra sobreposição | ✅ **testado, funciona** |
| Unificar usuários com `role` | ✅ `app_user` + enum `user_role` |
| `password` → `password_hash varchar(255)` | ✅ |
| E-mail único | ✅ (ainda nulo, ver 3.5) |
| `reservation.expires_at NOT NULL` | ✅ |
| `reservation` FKs `NOT NULL` + `RESTRICT` | ✅ |
| `UNIQUE (id, session_id)` em `reservation` | ✅ |
| FK composta em `reservation_seat` | ✅ |
| `reservation_seat.released_at` nulo, sem default | 🔴 **pendente** |
| Índice único parcial anti venda dupla | 🔴 **sumiu do modelo** |
| `seat.is_accessible` | 🟠 pendente |

Foi um avanço grande: quase todos os itens 🟠 foram resolvidos. Restam **4 itens críticos**, e dois deles juntos são o coração do desafio.

---

## 2. Resultado da execução

### 2.1 O script não roda até o fim

```
ERROR:  syntax error at or near "CHECK"
LINE 8:  CONSTRAINT ix_seat_check_number CHECK (CHECK (number BETWEE...

ERROR:  invalid input value for enum seat_status: "available"
LINE 5:  status public.seat_status NOT NULL DEFAULT 'available',
```

Os dois erros impedem a criação de `seat`. Tudo que depende dela (FKs, índice único, `reservation_seat.seat_fk`) falha em cascata com `relation "public.seat" does not exist`.

### 2.2 Testes de regra (após corrigir os dois erros numa cópia)

| # | Teste | Esperado | Obtido |
|---|---|---|---|
| T1 | Sessão sobreposta na mesma sala | erro | ✅ `violates exclusion constraint "session_no_overlap"` |
| T2 | Inserir assento na reserva sem informar `released_at` | `NULL` | 🔴 `2026-11-06 19:12:49` (nasce liberado) |
| T3 | Segunda reserva do **mesmo assento na mesma sessão** | erro (→ HTTP 409) | 🔴 **aceitou: 2 reservas ativas do mesmo assento** |
| T4 | Índice único em `reservation_seat` | existe | 🔴 só existe a PK |
| T5 | Assento com número 150 | erro | ✅ `violates check constraint` |
| T6 | Filme sem título e sem duração | erro | 🟠 aceitou |
| T7 | Sessão sem preço | erro | 🟠 aceitou |
| T8 | Usuário sem e-mail e sem senha | erro | 🟠 aceitou |

> 🔴 **T3 é a regra central do desafio:** *"duas requisições simultâneas para o mesmo assento devem resultar em exatamente uma reserva bem-sucedida"*. Hoje o banco aceita as duas.

---

## 3. Pendências

### 🔴 3.1 Venda dupla: `reservation_seat`

São dois problemas, e os dois precisam ser corrigidos:

1. **`released_at` continua `NOT NULL DEFAULT CURRENT_TIMESTAMP`.**
   No pgModeler: abra a coluna, **desmarque NOT NULL** e **apague a expressão do Default value**.
   `NULL` = assento preso; data preenchida = liberado (cancelado/expirado).

2. **O índice `ux_reservation_seat_session_id_seat_id` não está mais no modelo.**
   Provavelmente foi removido ao refazer as FKs. Recrie (aba *Indexes* da tabela):
   - **Unique** marcado
   - *Elements*: `session_id`, `seat_id` (nessa ordem), sem *included columns*
   - *Predicate*: `released_at IS NULL`

```sql
CREATE UNIQUE INDEX ux_reservation_seat_session_id_seat_id
    ON public.reservation_seat (session_id, seat_id)
    WHERE released_at IS NULL;
```

Corrigir só o índice **não basta**: com `released_at` sempre preenchido, nenhuma linha entra no índice parcial e ele nunca bloqueia nada.

### 🔴 3.2 `seat_status`: valores com espaço no final

```sql
ENUM ('available ','unavailable ');   -- ← espaço depois de cada valor
```

Os valores ficaram `'available␣'` e `'unavailable␣'`. Por isso o default `'available'` não é encontrado. No pgModeler: abra o tipo `seat_status` e redigite os valores **sem o espaço final**.

> 💡 `unavailable` é um nome bom e genérico. Só confira se ele fica claro ao lado do `is_accessible` (3.6): *indisponível* = manutenção, *acessível* = outro atributo.

### 🔴 3.3 `CHECK` duplicado

```sql
CONSTRAINT ix_seat_check_number CHECK (CHECK (number BETWEEN 1 AND 99))
```

O pgModeler já escreve o `CHECK (...)`. No campo *Expression* vai **só a condição**:

```
number BETWEEN 1 AND 99
```

Também vale renomear de `ix_` (prefixo de índice) para `ck_seat_number`.

### 🟠 3.4 Colunas que deveriam ser `NOT NULL`

| Tabela | Coluna | Por quê |
|---|---|---|
| `movie` | `title` | filme sem nome (T6) |
| `movie` | `duration` | a sobreposição depende dela, então adicione também `CHECK (duration > 0)` |
| `session` | `price` | sessão sem preço (T7), então adicione também `CHECK (price >= 0)` |
| `app_user` | `email` | usuário sem login (T8) |
| `app_user` | `password_hash` | idem |
| `reservation_seat` | `seat_id` | reserva de "assento nenhum" |

E em `reservation_seat.seat_fk`: troque `ON DELETE SET NULL` por **`RESTRICT`**. Não deve ser possível apagar um assento que tem histórico de reserva; use o `status = 'unavailable'` para tirá-lo de uso.

### 🟠 3.5 E-mail sem diferenciar maiúsculas

O índice único está em `email`, então `Joao@x.com` e `joao@x.com` viram contas diferentes. Duas opções:

- índice em `lower(email)` (no pgModeler: em *Elements*, selecione **Expression** em vez de *Column* e escreva `lower(email)`); ou
- normalizar para minúsculo na aplicação antes de salvar.

A segunda é suficiente para o desafio. Se escolher essa, registre no README como premissa.

### 🟠 3.6 `seat.is_accessible`

Ainda não existe. O escopo pede explicitamente: *"Alguns assentos podem ser marcados como indisponíveis (manutenção) **ou acessíveis**"*.

```sql
is_accessible boolean NOT NULL DEFAULT false
```

---

## 4. Melhorias 🟢

| Item | Atual | Sugestão |
|---|---|---|
| Nome do UNIQUE em `reservation` | `fk_id_session_id` | `uq_reservation_id_session_id`. Não é FK, é o alvo de uma |
| Nome do CHECK em `seat` | `ix_seat_check_number` | `ck_seat_number` |
| Nomes de FK repetidos | `theater_fk` em `seat` e `session`; `session_fk` | `fk_seat_theater`, `fk_session_theater`, `fk_reservation_session`... |
| PK de `app_user` | `user_pk` | `app_user_pk` |
| FK composta `reservation_seat → reservation` | `ON DELETE NO ACTION` | `CASCADE`, se apagar reserva deve levar os assentos. Com `NO ACTION`, o banco obriga a apagar os assentos antes (também é válido; escolha e documente) |
| Formato da fileira | livre | `CHECK (seat_row ~ '^[A-Z]{1,2}$')` |
| Assento repetido na mesma reserva | permitido | `UNIQUE (reservation_id, seat_id)` |
| `theater.name varchar(55)` | ok | ok |
| `ON UPDATE CASCADE` em FKs para UUID | sem efeito | pode ficar `NO ACTION` |

---

## 5. Checklist

### 🔴 Crítico
- [ ] `reservation_seat.released_at` → nulo, sem default
- [ ] Recriar `ux_reservation_seat_session_id_seat_id` (UNIQUE + `WHERE released_at IS NULL`)
- [ ] Enum `seat_status` sem espaço nos valores
- [ ] `CHECK` do número só com a condição

### 🟠 Importante
- [ ] `movie.title`, `movie.duration` → `NOT NULL` + `CHECK (duration > 0)`
- [ ] `session.price` → `NOT NULL` + `CHECK (price >= 0)`
- [ ] `app_user.email`, `app_user.password_hash` → `NOT NULL`
- [ ] `reservation_seat.seat_id` → `NOT NULL`, FK `RESTRICT`
- [ ] `seat.is_accessible`
- [ ] E-mail case-insensitive (índice em `lower(email)` ou normalização na aplicação)

### 🟢 Melhoria
- [ ] Padronizar nomes (`uq_`, `ck_`, `fk_`, `ux_`)
- [ ] `ON DELETE` da FK composta: decidir `CASCADE` × `NO ACTION`
- [ ] `CHECK` de formato em `seat_row`
- [ ] `UNIQUE (reservation_id, seat_id)`

---

## 6. Como validar sozinho

Para rodar o mesmo teste localmente:

```bash
docker run -d --rm --name pgval -e POSTGRES_PASSWORD=x postgres:18
# aguarde ~5s
grep -v '^CREATE DATABASE' docs/model/model.sql \
  | docker exec -i pgval psql -U postgres -v ON_ERROR_STOP=1
docker stop pgval
```

Com `ON_ERROR_STOP=1`, o psql para no primeiro erro, e fica fácil ver a causa raiz em vez dos erros em cascata.

O teste de **venda dupla** que vale levar para os testes de integração (T3) é:

```sql
-- mesma sessão, mesmo assento, reservas diferentes
INSERT INTO reservation_seat (reservation_id, session_id, seat_id) VALUES (:r1, :s, :a);
INSERT INTO reservation_seat (reservation_id, session_id, seat_id) VALUES (:r2, :s, :a);
-- esperado na 2ª: ERROR 23505 unique_violation → HTTP 409
```
