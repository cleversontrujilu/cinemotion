import type { Problem } from '#api'

/** O Problem Details de um erro do $fetch, se a API devolveu um. */
export function asProblem(error: unknown): Problem | null {
  const data = (error as { data?: unknown } | null)?.data
  return data && typeof data === 'object' && 'type' in data ? data as Problem : null
}

/** Verifica o código do erro: `isProblem(err, 'seat-already-taken')`. */
export function isProblem(error: unknown, code: string): boolean {
  return asProblem(error)?.type === `/problems/${code}`
}

/** Mensagem para exibir: o `detail` da API e, na validação, a lista de campos. */
export function problemMessage(error: unknown, fallback = 'Não foi possível concluir a operação. Tente de novo.'): string {
  const problem = asProblem(error)
  if (!problem) return fallback
  if (problem.errors?.length) return problem.errors.map(e => e.message).join(' ')
  return problem.detail ?? problem.title ?? fallback
}
