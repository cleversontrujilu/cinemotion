-- ** Database generated with pgModeler (PostgreSQL Database Modeler).
-- ** pgModeler version: 2.0.0
-- ** PostgreSQL version: 18.0
-- ** Project Site: pgmodeler.io
-- ** Model Author: ---

-- ** Database creation must be performed outside a multi lined SQL file. 
-- ** These commands were put in this file only as a convenience.

-- object: cinemotion | type: DATABASE --
-- DROP DATABASE IF EXISTS cinemotion;
CREATE DATABASE cinemotion;
-- ddl-end --


SET search_path TO pg_catalog,public;
-- ddl-end --

-- object: public.movie | type: TABLE --
-- DROP TABLE IF EXISTS public.movie CASCADE;
CREATE TABLE public.movie (
	id uuid NOT NULL DEFAULT uuidv7(),
	title varchar(200) NOT NULL,
	duration int4 NOT NULL,
	CONSTRAINT movie_pk PRIMARY KEY (id)
);
-- ddl-end --
COMMENT ON COLUMN public.movie.duration IS E'Duration in minutes';
-- ddl-end --
ALTER TABLE public.movie OWNER TO postgres;
-- ddl-end --

-- object: public.theater | type: TABLE --
-- DROP TABLE IF EXISTS public.theater CASCADE;
CREATE TABLE public.theater (
	id uuid NOT NULL DEFAULT uuidv7(),
	name varchar(55) NOT NULL,
	CONSTRAINT theater_pk PRIMARY KEY (id)
);
-- ddl-end --
ALTER TABLE public.theater OWNER TO postgres;
-- ddl-end --

-- object: public.seat | type: TABLE --
-- DROP TABLE IF EXISTS public.seat CASCADE;
CREATE TABLE public.seat (
	id uuid NOT NULL DEFAULT uuidv7(),
	seat_row varchar(3) NOT NULL,
	number int2 NOT NULL,
	is_available boolean NOT NULL DEFAULT true,
	is_acessible boolean NOT NULL DEFAULT false,
	theater_id uuid NOT NULL,
	CONSTRAINT seat_pk PRIMARY KEY (id),
	CONSTRAINT ck_seat_number CHECK (number BETWEEN 1 AND 99)
);
-- ddl-end --
COMMENT ON COLUMN public.seat.seat_row IS E'Ex.: the seat is in row J or AA';
-- ddl-end --
COMMENT ON COLUMN public.seat.number IS E'1 - 99';
-- ddl-end --
COMMENT ON COLUMN public.seat.is_acessible IS E'Accessible seating';
-- ddl-end --
ALTER TABLE public.seat OWNER TO postgres;
-- ddl-end --

-- object: public.session | type: TABLE --
-- DROP TABLE IF EXISTS public.session CASCADE;
CREATE TABLE public.session (
	id uuid NOT NULL DEFAULT uuidv7(),
	starts_at timestamptz NOT NULL,
	price numeric(10,2) NOT NULL,
	ends_at timestamptz NOT NULL,
	movie_id uuid NOT NULL,
	theater_id uuid NOT NULL,
	CONSTRAINT session_pk PRIMARY KEY (id),
	CONSTRAINT ix_price CHECK (price >= 0)
);
-- ddl-end --
ALTER TABLE public.session OWNER TO postgres;
-- ddl-end --

-- Appended SQL commands --
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE session    
  ADD CONSTRAINT session_time_chk CHECK (ends_at > starts_at),
  ADD CONSTRAINT session_no_overlap EXCLUDE USING gist (
      theater_id WITH =,
      tstzrange(starts_at, ends_at, '[)') WITH &&
  );
-- ddl-end --

-- object: theater_fk | type: CONSTRAINT --
-- ALTER TABLE public.seat DROP CONSTRAINT IF EXISTS theater_fk CASCADE;
ALTER TABLE public.seat ADD CONSTRAINT theater_fk FOREIGN KEY (theater_id)
REFERENCES public.theater (id) MATCH FULL
ON DELETE CASCADE ON UPDATE NO ACTION;
-- ddl-end --

-- object: movie_fk | type: CONSTRAINT --
-- ALTER TABLE public.session DROP CONSTRAINT IF EXISTS movie_fk CASCADE;
ALTER TABLE public.session ADD CONSTRAINT movie_fk FOREIGN KEY (movie_id)
REFERENCES public.movie (id) MATCH FULL
ON DELETE RESTRICT ON UPDATE RESTRICT;
-- ddl-end --

-- object: theater_fk | type: CONSTRAINT --
-- ALTER TABLE public.session DROP CONSTRAINT IF EXISTS theater_fk CASCADE;
ALTER TABLE public.session ADD CONSTRAINT theater_fk FOREIGN KEY (theater_id)
REFERENCES public.theater (id) MATCH FULL
ON DELETE RESTRICT ON UPDATE RESTRICT;
-- ddl-end --

-- object: public.user_role | type: TYPE --
-- DROP TYPE IF EXISTS public.user_role CASCADE;
CREATE TYPE public.user_role AS
ENUM ('admin','customer');
-- ddl-end --
ALTER TYPE public.user_role OWNER TO postgres;
-- ddl-end --

-- object: public.reservation_status | type: TYPE --
-- DROP TYPE IF EXISTS public.reservation_status CASCADE;
CREATE TYPE public.reservation_status AS
ENUM ('pending','confirmed','cancelled','expired');
-- ddl-end --
ALTER TYPE public.reservation_status OWNER TO postgres;
-- ddl-end --

-- object: public.reservation_seat | type: TABLE --
-- DROP TABLE IF EXISTS public.reservation_seat CASCADE;
CREATE TABLE public.reservation_seat (
	id uuid NOT NULL DEFAULT uuidv7(),
	released_at timestamptz,
	seat_id uuid NOT NULL,
	session_id uuid NOT NULL,
	reservation_id uuid NOT NULL,
	CONSTRAINT reservation_seat_pk PRIMARY KEY (id)
);
-- ddl-end --
ALTER TABLE public.reservation_seat OWNER TO postgres;
-- ddl-end --

-- object: public.reservation | type: TABLE --
-- DROP TABLE IF EXISTS public.reservation CASCADE;
CREATE TABLE public.reservation (
	id uuid NOT NULL DEFAULT uuidv7(),
	status public.reservation_status NOT NULL DEFAULT 'pending',
	created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
	expires_at timestamptz NOT NULL,
	confirmed_at timestamptz,
	cancelled_at timestamptz,
	session_id uuid NOT NULL,
	app_user_id uuid NOT NULL,
	CONSTRAINT reservation_pk PRIMARY KEY (id)
);
-- ddl-end --
ALTER TABLE public.reservation OWNER TO postgres;
-- ddl-end --

-- object: public.app_user | type: TABLE --
-- DROP TABLE IF EXISTS public.app_user CASCADE;
CREATE TABLE public.app_user (
	id uuid NOT NULL DEFAULT uuidv7(),
	email varchar(255) NOT NULL,
	password_hash varchar(255) NOT NULL,
	role public.user_role NOT NULL DEFAULT 'customer',
	created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT user_pk PRIMARY KEY (id)
);
-- ddl-end --
ALTER TABLE public.app_user OWNER TO postgres;
-- ddl-end --

-- object: session_fk | type: CONSTRAINT --
-- ALTER TABLE public.reservation DROP CONSTRAINT IF EXISTS session_fk CASCADE;
ALTER TABLE public.reservation ADD CONSTRAINT session_fk FOREIGN KEY (session_id)
REFERENCES public.session (id) MATCH FULL
ON DELETE RESTRICT ON UPDATE CASCADE;
-- ddl-end --

-- object: seat_fk | type: CONSTRAINT --
-- ALTER TABLE public.reservation_seat DROP CONSTRAINT IF EXISTS seat_fk CASCADE;
ALTER TABLE public.reservation_seat ADD CONSTRAINT seat_fk FOREIGN KEY (seat_id)
REFERENCES public.seat (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: ux_theater_name | type: INDEX --
-- DROP INDEX IF EXISTS public.ux_theater_name CASCADE;
CREATE UNIQUE INDEX ux_theater_name ON public.theater
USING btree
(
	name
);
-- ddl-end --

-- object: app_user_fk | type: CONSTRAINT --
-- ALTER TABLE public.reservation DROP CONSTRAINT IF EXISTS app_user_fk CASCADE;
ALTER TABLE public.reservation ADD CONSTRAINT app_user_fk FOREIGN KEY (app_user_id)
REFERENCES public.app_user (id) MATCH FULL
ON DELETE RESTRICT ON UPDATE CASCADE;
-- ddl-end --

-- object: ux_app_user_email | type: INDEX --
-- DROP INDEX IF EXISTS public.ux_app_user_email CASCADE;
CREATE UNIQUE INDEX ux_app_user_email ON public.app_user
USING btree
(
	(lower(email))
);
-- ddl-end --

-- object: ux_reservation_seat_session_id_seat_id | type: INDEX --
-- DROP INDEX IF EXISTS public.ux_reservation_seat_session_id_seat_id CASCADE;
CREATE UNIQUE INDEX ux_reservation_seat_session_id_seat_id ON public.reservation_seat
USING btree
(
	session_id,
	seat_id
)
WHERE (released_at IS NULL);
-- ddl-end --


