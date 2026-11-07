ALTER TABLE public.reservation_seat DROP CONSTRAINT IF EXISTS seat_fk CASCADE;
-- ddl-end --
ALTER TABLE public.reservation DROP CONSTRAINT IF EXISTS session_fk CASCADE;
-- ddl-end --
ALTER TABLE public.reservation DROP CONSTRAINT IF EXISTS app_user_fk CASCADE;
-- ddl-end --
ALTER TABLE public.session DROP CONSTRAINT IF EXISTS theater_fk CASCADE;
-- ddl-end --
ALTER TABLE public.session DROP CONSTRAINT IF EXISTS movie_fk CASCADE;
-- ddl-end --
ALTER TABLE public.seat DROP CONSTRAINT IF EXISTS theater_fk CASCADE;
-- ddl-end --
ALTER TABLE public.reservation_seat DROP CONSTRAINT IF EXISTS reservation_id_session_id_fk CASCADE;
-- ddl-end --
DROP INDEX IF EXISTS public.ux_reservation_seat_session_id_seat_id CASCADE;
-- ddl-end --
ALTER TABLE public.reservation DROP CONSTRAINT IF EXISTS uq_reservation_id_session_id CASCADE;
-- ddl-end --
DROP INDEX IF EXISTS public.ux_app_user_email CASCADE;
-- ddl-end --
DROP INDEX IF EXISTS public.ux_seat_row_number CASCADE;
-- ddl-end --
DROP INDEX IF EXISTS public.ux_theater_name CASCADE;
-- ddl-end --
DROP TABLE IF EXISTS public.app_user CASCADE;
-- ddl-end --
DROP TABLE IF EXISTS public.reservation CASCADE;
-- ddl-end --
DROP TABLE IF EXISTS public.reservation_seat CASCADE;
-- ddl-end --
DROP TYPE IF EXISTS public.reservation_status CASCADE;
-- ddl-end --
DROP TYPE IF EXISTS public.user_role CASCADE;
-- ddl-end --
DROP TABLE IF EXISTS public.session CASCADE;
-- ddl-end --
DROP TABLE IF EXISTS public.seat CASCADE;
-- ddl-end --
DROP TABLE IF EXISTS public.theater CASCADE;
-- ddl-end --
DROP TABLE IF EXISTS public.movie CASCADE;
-- ddl-end --
DROP DATABASE IF EXISTS cinemotion;
-- ddl-end --
