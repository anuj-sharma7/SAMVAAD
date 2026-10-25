/** Application error carrying an HTTP status and a stable machine-readable code. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what: string) => new AppError(404, "not_found", `${what} not found`);
export const forbidden = (message = "You are not allowed to do that") =>
  new AppError(403, "forbidden", message);
export const unauthenticated = () =>
  new AppError(401, "unauthenticated", "Please sign in to continue");
export const conflict = (code: string, message: string, details?: unknown) =>
  new AppError(409, code, message, details);
export const invalid = (message: string, details?: unknown) =>
  new AppError(422, "validation_failed", message, details);
