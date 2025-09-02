export function isJson(str: string) {
  try {
    JSON.parse(str);
  } catch (e) {
    return false;
  }
  return true;
}

export function formatJSON(json: string) {
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch (e) {
    return json;
  }
}

export function extractJson(text: string) {
  let openBraces = 0;
  let startIndex = -1;

  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      if (openBraces === 0) {
        startIndex = i;
      }
      openBraces++;
    } else if (text[i] === '}') {
      openBraces--;
      if (openBraces === 0 && startIndex !== -1) {
        return text.slice(startIndex, i + 1);
      }
    }
  }

  return '';
}
