const SAFE_EXCEPTION_MESSAGE = 'Error details withheld';

export interface SafeSpanException {
  message: string;
  name: string;
}

export function getErrorType(error: unknown): string {
  if (error instanceof Error) {
    return error.name || error.constructor.name;
  }

  if (error === null) {
    return 'null';
  }

  return typeof error;
}

export function getSafeSpanException(error: unknown): SafeSpanException {
  return {
    message: SAFE_EXCEPTION_MESSAGE,
    name: getErrorType(error),
  };
}
