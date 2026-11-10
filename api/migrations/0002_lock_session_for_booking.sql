-- Up Migration

-- SELECT ... FOR SHARE exige privilégio de UPDATE na tabela, e o role do Cliente só
-- lê o catálogo. Em vez de dar UPDATE em session ao Cliente, esta função (executada
-- com os privilégios do dono) faz só o lock + leitura que a reserva precisa.
-- O FOR SHARE impede que o Administrador edite/exclua a Sessão (que trava com
-- FOR UPDATE) enquanto uma Reserva está sendo criada nela.
CREATE FUNCTION lock_session_for_booking(p_session_id uuid)
RETURNS TABLE (id uuid, theater_id uuid, starts_at timestamptz, price numeric)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT s.id, s.theater_id, s.starts_at, s.price
  FROM session s
  WHERE s.id = p_session_id
  FOR SHARE
$$;

REVOKE ALL ON FUNCTION lock_session_for_booking(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lock_session_for_booking(uuid) TO cinemotion_customer;

-- Down Migration

DROP FUNCTION IF EXISTS lock_session_for_booking(uuid);
