import type { ErrorRequestHandler, RequestHandler } from 'express';
import { DomainError, type ErrorKind } from '../domain/errors.js';
import { isPgError, translatePgError } from './pg-error-translator.js';

/** Corpo de erro no formato Problem Details (RFC 9457). */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  [extension: string]: unknown;
}

export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

const STATUS_BY_KIND: Record<ErrorKind, number> = {
  validation: 400,
  unauthorized: 401,
  forbidden: 403,
  'not-found': 404,
  conflict: 409,
};

const TITLE_BY_KIND: Record<ErrorKind, string> = {
  validation: 'Requisição inválida',
  unauthorized: 'Não autenticado',
  forbidden: 'Acesso negado',
  'not-found': 'Recurso não encontrado',
  conflict: 'Conflito',
};

/** `type` como referência relativa (RFC 9457 §3.1.1): /problems/<código>. */
export const problemType = (code: string): string => `/problems/${code}`;

function fromDomainError(err: DomainError, instance: string): ProblemDetails {
  return {
    ...err.details,
    type: problemType(err.code),
    title: TITLE_BY_KIND[err.kind],
    status: STATUS_BY_KIND[err.kind],
    detail: err.message,
    instance,
  };
}

/** Erros que o próprio body-parser do Express lança (JSON malformado, corpo grande demais). */
function fromBodyParserError(err: unknown, instance: string): ProblemDetails | null {
  if (typeof err !== 'object' || err === null || !('type' in err)) return null;
  switch ((err as { type: unknown }).type) {
    case 'entity.parse.failed':
      return {
        type: problemType('malformed-json'),
        title: 'Requisição inválida',
        status: 400,
        detail: 'O corpo da requisição não é um JSON válido.',
        instance,
      };
    case 'entity.too.large':
      return {
        type: problemType('payload-too-large'),
        title: 'Corpo grande demais',
        status: 413,
        detail: 'O corpo da requisição excede o tamanho permitido.',
        instance,
      };
    default:
      return null;
  }
}

/** Converte qualquer erro em Problem Details. Erros desconhecidos viram 500 sem detalhes. */
export function toProblemDetails(err: unknown, instance: string): ProblemDetails {
  if (err instanceof DomainError) return fromDomainError(err, instance);

  if (isPgError(err)) {
    const translated = translatePgError(err);
    if (translated) return fromDomainError(translated, instance);
  }

  const bodyProblem = fromBodyParserError(err, instance);
  if (bodyProblem) return bodyProblem;

  return {
    type: problemType('internal-error'),
    title: 'Erro interno',
    status: 500,
    detail: 'Ocorreu um erro inesperado. Tente novamente mais tarde.',
    instance,
  };
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const problem = toProblemDetails(err, req.originalUrl);
  if (problem.status >= 500) console.error('[http] erro não tratado', err);
  res.status(problem.status).type(PROBLEM_CONTENT_TYPE).json(problem);
};

export const notFoundHandler: RequestHandler = (req, res) => {
  const problem: ProblemDetails = {
    type: problemType('route-not-found'),
    title: 'Recurso não encontrado',
    status: 404,
    detail: `Rota ${req.method} ${req.path} não existe.`,
    instance: req.originalUrl,
  };
  res.status(404).type(PROBLEM_CONTENT_TYPE).json(problem);
};
