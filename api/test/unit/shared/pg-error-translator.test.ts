import { describe, expect, it } from 'vitest';
import { isPgError, translatePgError } from '../../../src/shared/http/pg-error-translator.js';

const pgError = (code: string, extra: { constraint?: string; detail?: string } = {}) => ({
  severity: 'ERROR',
  code,
  ...extra,
});

describe('translatePgError', () => {
  it.each([
    ['23505', 'ux_reservation_seat_session_id_seat_id', 'seat-already-taken'],
    ['23505', 'ux_theater_name', 'theater-name-taken'],
    ['23505', 'ux_app_user_email', 'email-taken'],
    ['23505', 'ux_seat_theater_row_number', 'seat-duplicated'],
    ['23P01', 'session_no_overlap', 'session-overlap'],
  ])('%s em %s vira conflito %s', (code, constraint, expected) => {
    const err = translatePgError(pgError(code, { constraint }));
    expect(err).toMatchObject({ kind: 'conflict', code: expected });
  });

  it('unicidade sem significado de negócio vira conflito genérico', () => {
    expect(translatePgError(pgError('23505', { constraint: 'outro' }))).toMatchObject({
      kind: 'conflict',
      code: 'conflict',
    });
  });

  it('FK ainda referenciada vira in-use (409)', () => {
    const err = translatePgError(
      pgError('23503', { detail: 'Key (id)=(x) is still referenced from table "session".' }),
    );
    expect(err).toMatchObject({ kind: 'conflict', code: 'in-use' });
  });

  it('FK com ON DELETE RESTRICT (23001) vira in-use (409)', () => {
    expect(translatePgError(pgError('23001', { constraint: 'session_movie_fk' }))).toMatchObject({
      kind: 'conflict',
      code: 'in-use',
    });
  });

  it('FK apontando para registro inexistente vira not-found (404)', () => {
    const err = translatePgError(
      pgError('23503', { detail: 'Key (movie_id)=(x) is not present in table "movie".' }),
    );
    expect(err).toMatchObject({ kind: 'not-found', code: 'not-found' });
  });

  it('usuário do token que não existe mais (reservation_app_user_fk) vira invalid-token (401)', () => {
    const err = translatePgError(pgError('23503', { constraint: 'reservation_app_user_fk' }));
    expect(err).toMatchObject({ kind: 'unauthorized', code: 'invalid-token' });
  });

  it.each(['23514', '23502', '22P02'])('%s vira erro de validação', (code) => {
    expect(translatePgError(pgError(code, { constraint: 'ck_seat_number' }))).toMatchObject({
      kind: 'validation',
      code: 'validation-error',
    });
  });

  it('erro sem tradução devolve null (vira 500)', () => {
    expect(translatePgError(pgError('40001'))).toBeNull();
  });

  it('nunca repassa a mensagem crua do Postgres', () => {
    const err = translatePgError({
      ...pgError('23505', { constraint: 'ux_theater_name' }),
      detail: 'Key (name)=(Sala 1) already exists.',
    });
    expect(err?.message).not.toContain('Key (name)');
  });
});

describe('isPgError', () => {
  it('reconhece erros do pg pelo severity + SQLSTATE', () => {
    expect(isPgError(pgError('23505'))).toBe(true);
  });

  it.each([new Error('x'), { code: 'ECONNREFUSED', severity: 'ERROR' }, null, 'texto'])(
    'rejeita %o',
    (value) => {
      expect(isPgError(value)).toBe(false);
    },
  );
});
