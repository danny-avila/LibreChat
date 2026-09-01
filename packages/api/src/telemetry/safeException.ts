const SAFE_EXCEPTION_MESSAGE = 'Error details withheld';

export interface SafeSpanException {
  message: string;
  name: string;
}

function getErrorConstructorName(error: Error): string {
  try {
    const prototype = Object.getPrototypeOf(error) as { constructor?: unknown } | null;
    const constructorName =
      typeof prototype?.constructor === 'function' ? prototype.constructor.name : '';
    return /^[A-Za-z_$][A-Za-z0-9_$]{0,127}$/.test(constructorName) ? constructorName : 'Error';
  } catch {
    return 'Error';
  }
}

export function getErrorType(error: unknown): string {
  try {
    if (error instanceof Error) {
      return getErrorConstructorName(error);
    }
  } catch {
    return 'object';
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
