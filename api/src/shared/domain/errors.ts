/**
 * Categoria do erro de domínio. A camada HTTP traduz cada uma para um status;
 * o domínio não conhece HTTP.
 */
export type ErrorKind = 'validation' | 'unauthorized' | 'forbidden' | 'not-found' | 'conflict';

export class DomainError extends Error {
  override readonly name = 'DomainError';

  constructor(
    readonly kind: ErrorKind,
    /** Identificador estável do problema (vira o `type` do Problem Details). Ex.: `seat-already-taken`. */
    readonly code: string,
    message: string,
    /** Campos extras expostos ao cliente (ex.: `conflictingSeats`). */
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}
