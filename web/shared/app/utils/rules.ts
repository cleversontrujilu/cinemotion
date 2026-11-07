// Regras do domínio que o site mostra ao usuário. A API é quem garante; estes valores
// só orientam a interface (e precisam acompanhar api/src/modules/*/domain).

/** Assentos por Reserva (MAX_SEATS_PER_RESERVATION). */
export const MAX_SEATS_PER_RESERVATION = 6
/** Minutos que uma Reserva pendente segura os assentos (HOLD_MINUTES). */
export const HOLD_MINUTES = 10
/** Horas antes da Sessão até quando dá para cancelar (CANCELLATION_DEADLINE_HOURS). */
export const CANCELLATION_DEADLINE_HOURS = 2
/** Tamanho mínimo da senha no cadastro (PASSWORD_MIN_LENGTH). */
export const PASSWORD_MIN_LENGTH = 8
