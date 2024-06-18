export const detectVariables = (text: string): boolean => {
  const regex = /{{(.*?)}}/g;
  return regex.test(text);
};

export const wrapVariable = (variable: string) => `{{${variable}}}`;

export const extractUniqueVariables = (text: string): string[] => {
  const regex = /{{(.*?)}}/g;
  let match: RegExpExecArray | null;
  const variables = new Set<string>();
  while ((match = regex.exec(text)) !== null) {
    variables.add(match[1]);
  }
  return Array.from(variables);
};

export const extractVariableInfo = (text: string) => {
  const regex = /{{(.*?)}}/g;
  let match: RegExpExecArray | null;
  const allVariables: string[] = [];
  const uniqueVariables: string[] = [];
  const repeatedVariables: Set<string> = new Set();
  const variableCount: Map<string, number> = new Map();
  const variableIndexMap: Map<string, number> = new Map();

  while ((match = regex.exec(text)) !== null) {
    const variable = match[1];
    allVariables.push(variable);

    const count = variableCount.get(variable) ?? 0;
    variableCount.set(variable, count + 1);

    if (count > 0) {
      repeatedVariables.add(variable);
    } else {
      uniqueVariables.push(variable);
      variableIndexMap.set(variable, uniqueVariables.length - 1);
    }
  }

  return {
    allVariables,
    uniqueVariables,
    repeatedVariables,
    variableIndexMap,
  };
};

export function formatDateTime(dateTimeString: string) {
  const date = new Date(dateTimeString);

  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();

  const formattedMinutes = minutes.toString().padStart(2, '0');
  const formattedSeconds = seconds.toString().padStart(2, '0');

  const ampm = hours >= 12 ? 'PM' : 'AM';

  const formattedHours = hours % 12 || 12;

  const formattedDate = `${month}/${day}/${year}`;
  const formattedTime = `${formattedHours}:${formattedMinutes}:${formattedSeconds} ${ampm}`;

  return `${formattedDate}, ${formattedTime}`;
}
