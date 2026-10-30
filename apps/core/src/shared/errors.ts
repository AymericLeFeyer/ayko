/** Application error mapped to the normalised `{code, message, details}` REST body. */
export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new AppError('not_found', `${what} introuvable`, 404);
export const unauthorized = () => new AppError('unauthorized', 'Authentification requise', 401);
export const conflict = (message: string) => new AppError('conflict', message, 409);

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
