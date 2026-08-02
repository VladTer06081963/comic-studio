import { randomUUID } from 'crypto';

export class AppError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (code, message, details) => new AppError(400, code, message, details);
export const unauthorized = (message = 'Authentication required') => new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (code = 'ORIGIN_FORBIDDEN', message = 'Origin is not allowed') => new AppError(403, code, message);
export const notFound = (code, message) => new AppError(404, code, message);
export const conflict = (code, message, details) => new AppError(409, code, message, details);
export const unavailable = (code, message) => new AppError(503, code, message);

export function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

export function requestIdMiddleware(idGenerator = randomUUID) {
  return (req, res, next) => {
    const supplied = req.get('x-request-id');
    req.id = supplied && /^[A-Za-z0-9._:-]{1,128}$/.test(supplied) ? supplied : idGenerator();
    res.set('X-Request-ID', req.id);
    next();
  };
}

export function notFoundMiddleware(req, _res, next) {
  next(notFound('ROUTE_NOT_FOUND', 'Route not found'));
}

export function errorMiddleware(logger) {
  return (error, req, res, _next) => {
    let err = error;
    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
      err = badRequest('INVALID_JSON', 'Malformed JSON body');
    } else if (error?.type === 'entity.too.large') {
      err = new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds configured limit');
    } else if (!(error instanceof AppError)) {
      err = new AppError(500, 'INTERNAL_ERROR', 'Internal server error');
    }

    logger?.error('api.error', {
      request_id: req.id,
      scenario_id: req.params?.id,
      code: err.code,
      status: err.status,
      error_name: error?.name,
    });

    if (res.headersSent) return;
    const body = {
      error: {
        code: err.code,
        message: err.message,
        request_id: req.id,
      },
    };
    if (err.details !== undefined) body.error.details = err.details;
    res.status(err.status).json(body);
  };
}
