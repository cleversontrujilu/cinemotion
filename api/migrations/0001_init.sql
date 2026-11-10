-- Up Migration

-- Schema inicial do Cinemotion. Parte do docs/model/model.sql (pgModeler), com estas correções:
--   * seat.is_acessible  -> is_accessible (grafia)
--   * session.ix_price   -> ck_session_price (prefixo ck_ é contrato do tradutor de erros)
--   * ck_movie_duration: duração positiva
--   * ux_seat_theater_row_number: um Assento por fileira/número na Sala
--   * reservation_seat -> reservation por FK composta (reservation_id, session_id),
--     garantindo que o assento retido pertence à mesma Sessão da Reserva
--   * reservation_seat.session_id -> session por FK
--   * ck_reservation_expires_after_creation
-- Os nomes de constraints e índices são contrato com o tradutor de erros
-- (api/src/shared/http/pg-error-translator.ts). Não renomeie sem atualizá-lo.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE user_role AS ENUM ('admin', 'customer');
CREATE TYPE reservation_status AS ENUM ('pending', 'confirmed', 'cancelled', 'expired');

CREATE TABLE app_user (
  id            uuid         NOT NULL DEFAULT uuidv7(),
  email         varchar(255) NOT NULL,
  password_hash varchar(255) NOT NULL,
  role          user_role    NOT NULL DEFAULT 'customer',
  created_at    timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT app_user_pk PRIMARY KEY (id)
);
CREATE UNIQUE INDEX ux_app_user_email ON app_user (lower(email));

CREATE TABLE movie (
  id       uuid         NOT NULL DEFAULT uuidv7(),
  title    varchar(200) NOT NULL,
  duration int4         NOT NULL,
  CONSTRAINT movie_pk PRIMARY KEY (id),
  CONSTRAINT ck_movie_duration CHECK (duration > 0)
);
COMMENT ON COLUMN movie.duration IS 'Duração em minutos';

CREATE TABLE theater (
  id   uuid        NOT NULL DEFAULT uuidv7(),
  name varchar(55) NOT NULL,
  CONSTRAINT theater_pk PRIMARY KEY (id)
);
CREATE UNIQUE INDEX ux_theater_name ON theater (name);

CREATE TABLE seat (
  id            uuid       NOT NULL DEFAULT uuidv7(),
  theater_id    uuid       NOT NULL,
  seat_row      varchar(3) NOT NULL,
  number        int2       NOT NULL,
  is_available  boolean    NOT NULL DEFAULT true,
  is_accessible boolean    NOT NULL DEFAULT false,
  CONSTRAINT seat_pk PRIMARY KEY (id),
  CONSTRAINT seat_theater_fk FOREIGN KEY (theater_id)
    REFERENCES theater (id) ON DELETE CASCADE,
  CONSTRAINT ck_seat_number CHECK (number BETWEEN 1 AND 99),
  CONSTRAINT ck_seat_row CHECK (seat_row ~ '^[A-Z]{1,3}$')
);
CREATE UNIQUE INDEX ux_seat_theater_row_number ON seat (theater_id, seat_row, number);
COMMENT ON COLUMN seat.seat_row IS 'Fileira, ex.: J ou AA';
COMMENT ON COLUMN seat.is_available IS 'false = Assento em manutenção';
COMMENT ON COLUMN seat.is_accessible IS 'Assento acessível';

CREATE TABLE session (
  id         uuid          NOT NULL DEFAULT uuidv7(),
  movie_id   uuid          NOT NULL,
  theater_id uuid          NOT NULL,
  starts_at  timestamptz   NOT NULL,
  ends_at    timestamptz   NOT NULL,
  price      numeric(10,2) NOT NULL,
  CONSTRAINT session_pk PRIMARY KEY (id),
  CONSTRAINT session_movie_fk FOREIGN KEY (movie_id)
    REFERENCES movie (id) ON DELETE RESTRICT,
  CONSTRAINT session_theater_fk FOREIGN KEY (theater_id)
    REFERENCES theater (id) ON DELETE RESTRICT,
  CONSTRAINT ck_session_price CHECK (price >= 0),
  CONSTRAINT session_time_chk CHECK (ends_at > starts_at),
  CONSTRAINT session_no_overlap EXCLUDE USING gist (
    theater_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  )
);
COMMENT ON COLUMN session.ends_at IS 'Início + duração do Filme + 15 min de limpeza, fixado na criação';
CREATE INDEX ix_session_starts_at ON session (starts_at);
CREATE INDEX ix_session_movie_id ON session (movie_id);

CREATE TABLE reservation (
  id           uuid               NOT NULL DEFAULT uuidv7(),
  session_id   uuid               NOT NULL,
  app_user_id  uuid               NOT NULL,
  status       reservation_status NOT NULL DEFAULT 'pending',
  created_at   timestamptz        NOT NULL DEFAULT now(),
  expires_at   timestamptz        NOT NULL,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  CONSTRAINT reservation_pk PRIMARY KEY (id),
  -- alvo da FK composta de reservation_seat
  CONSTRAINT ux_reservation_id_session_id UNIQUE (id, session_id),
  CONSTRAINT reservation_session_fk FOREIGN KEY (session_id)
    REFERENCES session (id) ON DELETE RESTRICT,
  CONSTRAINT reservation_app_user_fk FOREIGN KEY (app_user_id)
    REFERENCES app_user (id) ON DELETE RESTRICT,
  CONSTRAINT ck_reservation_expires_after_creation CHECK (expires_at > created_at)
);
CREATE INDEX ix_reservation_app_user_id ON reservation (app_user_id);
CREATE INDEX ix_reservation_session_pending ON reservation (session_id, expires_at)
  WHERE status = 'pending';

CREATE TABLE reservation_seat (
  id             uuid        NOT NULL DEFAULT uuidv7(),
  reservation_id uuid        NOT NULL,
  session_id     uuid        NOT NULL,
  seat_id        uuid        NOT NULL,
  -- NULL enquanto o Assento está retido (Reserva pendente ou Venda). Sem DEFAULT de propósito.
  released_at    timestamptz,
  CONSTRAINT reservation_seat_pk PRIMARY KEY (id),
  CONSTRAINT reservation_seat_reservation_fk FOREIGN KEY (reservation_id, session_id)
    REFERENCES reservation (id, session_id) ON DELETE CASCADE,
  CONSTRAINT reservation_seat_seat_fk FOREIGN KEY (seat_id)
    REFERENCES seat (id) ON DELETE RESTRICT
);
-- A garantia de que um Assento nunca fica em duas Reservas ativas na mesma Sessão.
CREATE UNIQUE INDEX ux_reservation_seat_session_id_seat_id
  ON reservation_seat (session_id, seat_id)
  WHERE released_at IS NULL;
CREATE INDEX ix_reservation_seat_reservation_id ON reservation_seat (reservation_id);

-- Roles da aplicação: cada Lambda conecta com o seu. São criados sem senha;
-- a senha é definida fora do repositório (ALTER ROLE ... PASSWORD).
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cinemotion_admin') THEN
    CREATE ROLE cinemotion_admin LOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cinemotion_customer') THEN
    CREATE ROLE cinemotion_customer LOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO cinemotion_admin, cinemotion_customer;

-- Administrador: gerencia Salas, Assentos, Filmes e Sessões; lê o resto
-- (login e checagem de Reservas ativas antes de editar uma Sessão).
GRANT SELECT, INSERT, UPDATE, DELETE ON theater, seat, movie, session TO cinemotion_admin;
GRANT SELECT ON app_user, reservation, reservation_seat TO cinemotion_admin;

-- Cliente: cadastro, Reservas e retenção de Assentos; lê o resto.
GRANT SELECT ON theater, seat, movie, session TO cinemotion_customer;
GRANT SELECT, INSERT ON app_user TO cinemotion_customer;
GRANT SELECT, INSERT, UPDATE ON reservation, reservation_seat TO cinemotion_customer;

-- Down Migration

DROP TABLE IF EXISTS reservation_seat;
DROP TABLE IF EXISTS reservation;
DROP TABLE IF EXISTS session;
DROP TABLE IF EXISTS seat;
DROP TABLE IF EXISTS theater;
DROP TABLE IF EXISTS movie;
DROP TABLE IF EXISTS app_user;
DROP TYPE IF EXISTS reservation_status;
DROP TYPE IF EXISTS user_role;
REVOKE USAGE ON SCHEMA public FROM cinemotion_admin, cinemotion_customer;
-- Os roles são do cluster e podem servir a outros bancos; não são removidos aqui.
