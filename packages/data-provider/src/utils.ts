export const envVarRegex = /^\$\{([^{}]+)\}$/;

const ENV_VAR_PREFIX = '${';
const ENV_VAR_SUFFIX = '}';

function isSimpleEnvVariableReference(value: string): boolean {
  return value.startsWith(ENV_VAR_PREFIX) && value.endsWith(ENV_VAR_SUFFIX);
}

function parseEnvVariableName(value: string): string | null {
  if (!isSimpleEnvVariableReference(value)) {
    return null;
  }

  const varName = value.slice(ENV_VAR_PREFIX.length, -ENV_VAR_SUFFIX.length);
  return varName.length > 0 && !varName.includes(ENV_VAR_SUFFIX) ? varName : null;
}

/** Extracts the environment variable name from a template literal string */
export function extractVariableName(value: string): string | null {
  if (!value) {
    return null;
  }

  return parseEnvVariableName(value.trim());
}

/** Extracts the value of an environment variable from a string. */
export function extractEnvVariable(value: string) {
  if (!value) {
    return value;
  }

  const trimmed = value.trim();

  const singleVariableName = parseEnvVariableName(trimmed);
  if (singleVariableName) {
    return process.env[singleVariableName] || trimmed;
  }

  let result = '';
  let index = 0;

  while (index < trimmed.length) {
    const startIndex = trimmed.indexOf(ENV_VAR_PREFIX, index);
    if (startIndex < 0) {
      result += trimmed.slice(index);
      break;
    }

    result += trimmed.slice(index, startIndex);

    const endIndex = trimmed.indexOf(ENV_VAR_SUFFIX, startIndex + ENV_VAR_PREFIX.length);
    if (endIndex < 0) {
      result += trimmed.slice(startIndex);
      break;
    }

    const variableName = trimmed.slice(startIndex + ENV_VAR_PREFIX.length, endIndex);
    const fullMatch = trimmed.slice(startIndex, endIndex + 1);
    result += process.env[variableName] || fullMatch;
    index = endIndex + 1;
  }

  return result;
}

/**
 * Normalize the endpoint name to system-expected value.
 * @param name
 */
export function normalizeEndpointName(name = ''): string {
  return name.toLowerCase() === 'ollama' ? 'ollama' : name;
}
