export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export const ok = <T>(data: T, meta?: Record<string, unknown>): ApiSuccess<T> => ({
  success: true,
  data,
  ...(meta ? { meta } : {}),
});

export const fail = (
  code: string,
  message: string,
  details?: unknown,
): ApiError => ({
  success: false,
  error: { code, message, ...(details !== undefined ? { details } : {}) },
});
