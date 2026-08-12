/** Structured error envelope returned by the backend. Never a stack trace. */
export interface ApiErrorBody {
  code: string;
  message: string;
  fieldErrors?: Record<string, string>;
  traceId?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: Record<string, string>;
  readonly traceId: string | undefined;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.fieldErrors = body.fieldErrors ?? {};
    this.traceId = body.traceId;
  }

  /** The slot was taken between rendering the grid and submitting the booking. */
  get isSlotUnavailable(): boolean {
    return this.status === 409 && this.code === 'SLOT_UNAVAILABLE';
  }

  get isUnauthenticated(): boolean {
    return this.status === 401;
  }
}
