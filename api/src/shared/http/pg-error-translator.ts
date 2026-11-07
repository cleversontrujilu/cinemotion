import { DomainError } from '../domain/errors.js';

/** Formato mínimo de um erro do Postgres vindo do `pg` (DatabaseError). */
export interface PgErrorLike {
  code: string;
  constraint?: string | undefined;
  detail?: string | undefined;
}

export function isPgError(err: unknown): err is PgErrorLike {
  if (typeof err !== 'object' || err === null || !('severity' in err) || !('code' in err)) return false;
  return typeof err.code === 'string' && /^[0-9A-Z]{5}$/.test(err.code);
}

/**
 * Violações de unicidade com significado de negócio. Os nomes dos índices são
 * contrato com a migration (api/migrations): renomear lá exige atualizar aqui.
 */
const UNIQUE_VIOLATIONS: Record<string, { code: string; message: string }> = {
  ux_reservation_seat_session_id_seat_id: {
    code: 'seat-already-taken',
    message: 'Um ou mais assentos já estão reservados ou vendidos nesta sessão.',
  },
  ux_theater_name: { code: 'theater-name-taken', message: 'Já existe uma sala com esse nome.' },
  ux_app_user_email: { code: 'email-taken', message: 'Já existe um usuário com esse e-mail.' },
  ux_seat_theater_row_number: {
    code: 'seat-duplicated',
    message: 'O mapa de assentos tem fileira e número repetidos.',
  },
};

const EXCLUSION_VIOLATIONS: Record<string, { code: string; message: string }> = {
  session_no_overlap: {
    code: 'session-overlap',
    message: 'A sessão se sobrepõe a outra na mesma sala (duração do filme + 15 min de limpeza).',
  },
};

/**
 * Traduz um erro do Postgres em erro de domínio. Devolve `null` quando o erro não
 * tem tradução (vira 500 genérico). A mensagem crua do Postgres nunca é exposta.
 */
export function translatePgError(err: PgErrorLike): DomainError | null {
  const constraint = err.constraint ?? '';

  switch (err.code) {
    case '23505': {
      const known = UNIQUE_VIOLATIONS[constraint];
      return known
        ? new DomainError('conflict', known.code, known.message)
        : new DomainError('conflict', 'conflict', 'O recurso entra em conflito com outro já existente.');
    }
    case '23P01': {
      const known = EXCLUSION_VIOLATIONS[constraint];
      return known
        ? new DomainError('conflict', known.code, known.message)
        : new DomainError('conflict', 'conflict', 'O recurso entra em conflito com outro já existente.');
    }
    case '23001': // restrict_violation: FK com ON DELETE RESTRICT
      return new DomainError('conflict', 'in-use', 'O recurso está em uso e não pode ser removido.');
    case '23503':
      // Em DELETE/UPDATE do referenciado (FK NO ACTION) o Postgres diz "is still referenced from table".
      return err.detail?.includes('is still referenced')
        ? new DomainError('conflict', 'in-use', 'O recurso está em uso e não pode ser removido.')
        : new DomainError('not-found', 'not-found', 'Um recurso referenciado não existe.');
    case '23514': // check_violation
    case '23502': // not_null_violation
    case '22P02': // invalid_text_representation (ex.: uuid malformado)
    case '22001': // string_data_right_truncation
    case '22003': // numeric_value_out_of_range
      return new DomainError('validation', 'validation-error', 'Dados de entrada inválidos.');
    default:
      return null;
  }
}
