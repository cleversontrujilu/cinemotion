-- =============================================================================
-- reset.sql — apaga e recria o banco cinemotion do zero (schema + seed)
--
-- Uso (a partir da raiz do projeto):
--   psql -h localhost -U postgres -f docs/model/reset.sql
--
-- ATENÇÃO: apaga o banco cinemotion inteiro, inclusive dados criados pela API.
--
-- Executa, em ordem:
--   1. DROP DATABASE cinemotion (derruba conexões abertas, ex.: pgAdmin/DBeaver/API)
--   2. CREATE DATABASE cinemotion
--   3. model.sql  (schema gerado pelo pgModeler)
--   4. seed.sql   (dados de exemplo)
-- =============================================================================

\set ON_ERROR_STOP on

\connect postgres

\echo '>> Removendo o banco cinemotion...'
DROP DATABASE IF EXISTS cinemotion WITH (FORCE);

\echo '>> Criando o banco cinemotion...'
CREATE DATABASE cinemotion;

\connect cinemotion

-- O model.sql gerado pelo pgModeler começa com "CREATE DATABASE cinemotion;".
-- Como o banco já foi criado acima, essa linha vai falhar com
--   ERROR:  database "cinemotion" already exists
-- e isso é ESPERADO. Por isso o ON_ERROR_STOP fica desligado só durante o schema;
-- logo depois conferimos se todas as tabelas foram criadas.
\echo '>> Aplicando o schema (model.sql) — o erro "database already exists" é esperado'
\set ON_ERROR_STOP off
\ir model.sql
\set ON_ERROR_STOP on

SELECT count(*) = 7 AS schema_ok
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('app_user', 'movie', 'theater', 'seat', 'session',
                    'reservation', 'reservation_seat')
\gset

\if :schema_ok
  \echo '>> Schema OK'
\else
  \echo '>> ERRO: o schema não foi criado por completo. Veja os erros acima (além do "already exists").'
  \quit
\endif

\echo '>> Aplicando o seed (seed.sql)...'
\ir seed.sql

\echo '>> Pronto!'
