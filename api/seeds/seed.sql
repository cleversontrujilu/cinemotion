-- =============================================================================
-- seed.sql — dados de exemplo para o banco cinemotion
--
-- Uso (com o schema já criado):
--   npm run db:seed -w api      (ou: psql "$MIGRATION_DATABASE_URL" -f api/seeds/seed.sql)
--
-- O script é idempotente: apaga os dados (TRUNCATE) e insere tudo de novo.
-- As datas são relativas a now(), então rodar de novo "atualiza" as sessões futuras.
--
-- Conteúdo:
--   app_user          12   (2 admins + 10 clientes) — senha de todos: Senha@123
--   movie             10
--   theater            3   (Sala 1: A1–J12 · Sala 2: A1–H10 · Sala 3 VIP: A1–E8)
--   seat             240   (A1 e A2 de cada sala são acessíveis)
--   session           66   (63 futuras + 3 cenários especiais)
--   reservation       34
--   reservation_seat ~110
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

TRUNCATE reservation_seat, reservation, session, seat, theater, movie, app_user CASCADE;

-- -----------------------------------------------------------------------------
-- Usuários
-- Hash bcrypt (cost 10, prefixo $2a$) de 'Senha@123'.
-- -----------------------------------------------------------------------------
INSERT INTO app_user (email, password_hash, role) VALUES
  ('admin@cinemotion.dev',      '$2a$10$NXfEBSnhlL9A1/8LFqaMA.LQY80miJv6hPdjZC3oZlih74ejpfljK', 'admin'),
  ('gerente@cinemotion.dev',    '$2a$10$NXfEBSnhlL9A1/8LFqaMA.LQY80miJv6hPdjZC3oZlih74ejpfljK', 'admin'),
  ('ana.souza@email.com',       '$2a$10$NXfEBSnhlL9A1/8LFqaMA.LQY80miJv6hPdjZC3oZlih74ejpfljK', 'customer'),
  ('bruno.lima@email.com',      '$2a$10$NXfEBSnhlL9A1/8LFqaMA.LQY80miJv6hPdjZC3oZlih74ejpfljK', 'customer'),
  ('carla.mendes@email.com',    '$2a$10$NXfEBSnhlL9A1/8LFqaMA.LQY80miJv6hPdjZC3oZlih74ejpfljK', 'customer'),
  ('diego.alves@email.com',     '$2a$10$NXfEBSnhlL9A1/8LFqaMA.LQY80miJv6hPdjZC3oZlih74ejpfljK', 'customer'),
  ('elisa.rocha@email.com',     '$2a$10$NXfEBSnhlL9A1/8LFqaMA.LQY80miJv6hPdjZC3oZlih74ejpfljK', 'customer'),
  ('felipe.costa@email.com',    '$2a$10$NXfEBSnhlL9A1/8LFqaMA.LQY80miJv6hPdjZC3oZlih74ejpfljK', 'customer'),
  ('gabriela.nunes@email.com',  '$2a$10$NXfEBSnhlL9A1/8LFqaMA.LQY80miJv6hPdjZC3oZlih74ejpfljK', 'customer'),
  ('henrique.dias@email.com',   '$2a$10$NXfEBSnhlL9A1/8LFqaMA.LQY80miJv6hPdjZC3oZlih74ejpfljK', 'customer'),
  ('isabela.ramos@email.com',   '$2a$10$NXfEBSnhlL9A1/8LFqaMA.LQY80miJv6hPdjZC3oZlih74ejpfljK', 'customer'),
  ('joao.pereira@email.com',    '$2a$10$NXfEBSnhlL9A1/8LFqaMA.LQY80miJv6hPdjZC3oZlih74ejpfljK', 'customer');

-- -----------------------------------------------------------------------------
-- Filmes (duração em minutos)
-- -----------------------------------------------------------------------------
INSERT INTO movie (title, duration) VALUES
  ('Ainda Estou Aqui',       137),
  ('Bacurau',                131),
  ('Central do Brasil',      113),
  ('Cidade de Deus',         130),
  ('Divertida Mente 2',       96),
  ('Duna: Parte Dois',       166),
  ('Interestelar',           169),
  ('O Auto da Compadecida',  104),
  ('Oppenheimer',            180),
  ('Tropa de Elite',         115);

-- -----------------------------------------------------------------------------
-- Salas
-- -----------------------------------------------------------------------------
INSERT INTO theater (name) VALUES
  ('Sala 1'),
  ('Sala 2'),
  ('Sala 3 VIP');

-- -----------------------------------------------------------------------------
-- Assentos: fileiras A.. e números 1..N por sala.
-- A1 e A2 de cada sala são acessíveis; os demais não.
-- -----------------------------------------------------------------------------
INSERT INTO seat (theater_id, seat_row, number, is_accessible)
SELECT t.id,
       chr(64 + r),                 -- 1 → 'A', 2 → 'B'...
       n,
       (r = 1 AND n IN (1, 2))
FROM theater t
JOIN (VALUES ('Sala 1',     10, 12),   -- A1–J12 (exemplo do escopo)
             ('Sala 2',      8, 10),   -- A1–H10
             ('Sala 3 VIP',  5,  8))   -- A1–E8
     AS cfg(name, total_rows, total_numbers) ON cfg.name = t.name
CROSS JOIN LATERAL generate_series(1, cfg.total_rows)    AS r
CROSS JOIN LATERAL generate_series(1, cfg.total_numbers) AS n;

-- -----------------------------------------------------------------------------
-- Sessões futuras: próximos 7 dias, 3 horários por sala (horário de Brasília).
-- ends_at = starts_at + duração + 15 min de limpeza.
-- Maior filme (180 + 15 = 195 min) cabe entre os horários 14:00 → 17:30 → 21:00.
-- -----------------------------------------------------------------------------
INSERT INTO session (movie_id, theater_id, starts_at, ends_at, price)
SELECT m.id,
       t.id,
       s.starts_at,
       s.starts_at + make_interval(mins => m.duration + 15),
       CASE
         WHEN t.name = 'Sala 3 VIP' THEN 58.00
         WHEN s.slot_idx = 1        THEN 26.00   -- matinê
         ELSE                            34.00
       END
FROM (
  SELECT d,
         sl.slot_idx,
         th.theater_idx,
         (((now() AT TIME ZONE 'America/Sao_Paulo')::date + d) + sl.slot)
           AT TIME ZONE 'America/Sao_Paulo' AS starts_at
  FROM generate_series(1, 7) AS d
  CROSS JOIN unnest(ARRAY[time '14:00', time '17:30', time '21:00'])
             WITH ORDINALITY AS sl(slot, slot_idx)
  CROSS JOIN generate_series(1, 3) AS th(theater_idx)
) s
JOIN (SELECT id, name, row_number() OVER (ORDER BY name) AS idx FROM theater) t
  ON t.idx = s.theater_idx
JOIN (SELECT id, duration, row_number() OVER (ORDER BY title) - 1 AS idx FROM movie) m
  ON m.idx = (s.d * 3 + s.theater_idx * 2 + s.slot_idx) % 10;

-- -----------------------------------------------------------------------------
-- Sessões especiais (para testar regras de negócio)
--   1. Começa em ~1h      → reserva permitida, cancelamento NÃO (< 2h)
--   2. Começou há 30 min  → reserva NÃO permitida (já começou)
--   3. Passada (há 3 dias)→ não aparece na listagem de sessões futuras
-- -----------------------------------------------------------------------------
INSERT INTO session (movie_id, theater_id, starts_at, ends_at, price)
SELECT m.id, t.id, x.starts_at, x.starts_at + make_interval(mins => m.duration + 15), x.price
FROM (VALUES
        ('Sala 1',     'Tropa de Elite',    date_trunc('minute', now()) + interval '1 hour',    34.00),
        ('Sala 2',     'Divertida Mente 2', date_trunc('minute', now()) - interval '30 minutes', 34.00),
        ('Sala 3 VIP', 'Central do Brasil', date_trunc('minute', now()) - interval '3 days',     58.00)
     ) AS x(theater_name, movie_title, starts_at, price)
JOIN theater t ON t.name  = x.theater_name
JOIN movie   m ON m.title = x.movie_title;

-- -----------------------------------------------------------------------------
-- Reservas
--
-- 30 reservas em sessões futuras distintas, com 1 a 6 assentos consecutivos,
-- distribuídas entre os status:
--   confirmed  → assentos presos (released_at NULL)     = "vendido"
--   pending    → assentos presos, expira em ~7 min      = "reservado"
--   cancelled  → assentos liberados (released_at)       = "livre"
--   expired    → assentos liberados (released_at)       = "livre"
--
-- released_at é sempre informado explicitamente (ver nota no fim do arquivo).
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_sessions  uuid[];
  v_customers uuid[];
  v_session   uuid;
  v_theater   uuid;
  v_res       uuid;
  v_status    reservation_status;
  v_created   timestamptz;
  v_released  timestamptz;
  i           int;
BEGIN
  SELECT array_agg(id ORDER BY starts_at, theater_id) INTO v_sessions
  FROM session WHERE starts_at > now() + interval '2 hours';

  SELECT array_agg(id ORDER BY email) INTO v_customers
  FROM app_user WHERE role = 'customer';

  FOR i IN 1..30 LOOP
    v_session := v_sessions[i * 2];
    SELECT theater_id INTO v_theater FROM session WHERE id = v_session;

    v_status := (ARRAY['confirmed','confirmed','pending','cancelled','expired']
                 ::reservation_status[])[1 + i % 5];

    v_created := CASE WHEN v_status = 'pending'
                      THEN now() - interval '3 minutes'
                      ELSE now() - make_interval(hours => i) END;

    v_released := CASE v_status
                    WHEN 'cancelled' THEN v_created + interval '5 minutes'
                    WHEN 'expired'   THEN v_created + interval '10 minutes'
                  END;

    INSERT INTO reservation (app_user_id, session_id, status, created_at, expires_at,
                             confirmed_at, cancelled_at)
    VALUES (v_customers[1 + i % 10], v_session, v_status, v_created,
            v_created + interval '10 minutes',
            CASE WHEN v_status = 'confirmed' THEN v_created + interval '4 minutes' END,
            CASE WHEN v_status = 'cancelled' THEN v_released END)
    RETURNING id INTO v_res;

    -- 1 a 6 assentos consecutivos na fileira A..E (existe em todas as salas)
    INSERT INTO reservation_seat (reservation_id, session_id, seat_id, released_at)
    SELECT v_res, v_session, s.id, v_released
    FROM seat s
    WHERE s.theater_id = v_theater
      AND s.seat_row   = chr(65 + i % 5)
    ORDER BY s.number
    LIMIT 1 + i % 6;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- Cenários especiais de reserva
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_res      uuid;
  v_old      record;
  v_session  uuid;
  v_theater  uuid;
BEGIN
  -- (A) Assento revendido: os assentos de uma reserva CANCELADA foram comprados
  --     por outro cliente. Prova que o índice único parcial só considera
  --     released_at IS NULL (histórico preservado + assento reutilizado).
  SELECT r.id, r.session_id, r.app_user_id INTO v_old
  FROM reservation r WHERE r.status = 'cancelled' ORDER BY r.created_at LIMIT 1;

  INSERT INTO reservation (app_user_id, session_id, status, created_at, expires_at, confirmed_at)
  VALUES ((SELECT id FROM app_user WHERE role = 'customer' AND id <> v_old.app_user_id
           ORDER BY email LIMIT 1),
          v_old.session_id, 'confirmed',
          now() - interval '20 minutes', now() - interval '10 minutes', now() - interval '18 minutes')
  RETURNING id INTO v_res;

  INSERT INTO reservation_seat (reservation_id, session_id, seat_id, released_at)
  SELECT v_res, rs.session_id, rs.seat_id, NULL
  FROM reservation_seat rs WHERE rs.reservation_id = v_old.id;

  -- (B) Reserva PENDENTE VENCIDA ainda não processada: status 'pending',
  --     expires_at no passado e assentos ainda presos. A API deve tratar
  --     esses assentos como livres e liberá-los ao receber nova reserva.
  SELECT id, theater_id INTO v_session, v_theater
  FROM session WHERE starts_at > now() + interval '2 hours'
  ORDER BY starts_at DESC, theater_id LIMIT 1;

  INSERT INTO reservation (app_user_id, session_id, status, created_at, expires_at)
  VALUES ((SELECT id FROM app_user WHERE email = 'joao.pereira@email.com'),
          v_session, 'pending', now() - interval '25 minutes', now() - interval '15 minutes')
  RETURNING id INTO v_res;

  INSERT INTO reservation_seat (reservation_id, session_id, seat_id, released_at)
  SELECT v_res, v_session, s.id, NULL
  FROM seat s WHERE s.theater_id = v_theater AND s.seat_row = 'C' AND s.number IN (5, 6);

  -- (C) Reserva CONFIRMADA na sessão que começa em ~1h → cancelamento deve
  --     ser recusado (regra das 2 horas).
  SELECT s.id, s.theater_id INTO v_session, v_theater
  FROM session s JOIN movie m ON m.id = s.movie_id
  WHERE m.title = 'Tropa de Elite'
    AND s.starts_at BETWEEN now() AND now() + interval '2 hours';

  INSERT INTO reservation (app_user_id, session_id, status, created_at, expires_at, confirmed_at)
  VALUES ((SELECT id FROM app_user WHERE email = 'ana.souza@email.com'),
          v_session, 'confirmed', now() - interval '1 day', now() - interval '1 day' + interval '10 minutes',
          now() - interval '1 day' + interval '3 minutes')
  RETURNING id INTO v_res;

  INSERT INTO reservation_seat (reservation_id, session_id, seat_id, released_at)
  SELECT v_res, v_session, s.id, NULL
  FROM seat s WHERE s.theater_id = v_theater AND s.seat_row = 'F' AND s.number BETWEEN 6 AND 7;

  -- (D) Reserva PENDENTE e válida na mesma sessão de ~1h (G8 a G10).
  INSERT INTO reservation (app_user_id, session_id, status, created_at, expires_at)
  VALUES ((SELECT id FROM app_user WHERE email = 'bruno.lima@email.com'),
          v_session, 'pending', now() - interval '2 minutes', now() + interval '8 minutes')
  RETURNING id INTO v_res;

  INSERT INTO reservation_seat (reservation_id, session_id, seat_id, released_at)
  SELECT v_res, v_session, s.id, NULL
  FROM seat s WHERE s.theater_id = v_theater AND s.seat_row = 'G' AND s.number BETWEEN 8 AND 10;
END $$;

COMMIT;

-- -----------------------------------------------------------------------------
-- Resumo
-- -----------------------------------------------------------------------------
SELECT 'app_user' AS tabela, count(*) AS registros FROM app_user
UNION ALL SELECT 'movie',            count(*) FROM movie
UNION ALL SELECT 'theater',          count(*) FROM theater
UNION ALL SELECT 'seat',             count(*) FROM seat
UNION ALL SELECT 'session',          count(*) FROM session
UNION ALL SELECT 'reservation',      count(*) FROM reservation
UNION ALL SELECT 'reservation_seat', count(*) FROM reservation_seat;
