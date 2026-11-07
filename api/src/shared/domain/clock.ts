/**
 * Relógio injetável para os testes unitários das regras de tempo.
 * Em produção as regras de tempo usam o now() do banco, dentro da transação.
 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export function fixedClock(at: Date | string): Clock {
  const instant = new Date(at);
  return { now: () => new Date(instant) };
}
