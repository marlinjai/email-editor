import { ERROR_STATUS, errorBody, type ErrorBody, type ErrorCode } from '@marlinjai/mail-contract';

/**
 * A failure with one of the contract's error codes. Thrown anywhere in a
 * request; the app's error handler turns it into the contract's envelope
 * `{ error: { code, message, details? } }` with the code's status.
 */
export class ApiError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = ERROR_STATUS[code];
  }

  toBody(): ErrorBody {
    return errorBody(this.code, this.message, this.details);
  }
}
