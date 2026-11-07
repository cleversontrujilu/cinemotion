import { z } from 'zod';
import { DomainError } from '../domain/errors.js';

// Mensagens de validação em português.
z.config(z.locales.pt());

export interface FieldError {
  path: string;
  message: string;
}

/**
 * Valida `input` contra `schema`. Em falha lança DomainError de validação com a
 * lista de campos inválidos (vira 400 com `errors` no Problem Details).
 */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  const errors: FieldError[] = result.error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
  throw new DomainError('validation', 'validation-error', 'Dados de entrada inválidos.', { errors });
}
