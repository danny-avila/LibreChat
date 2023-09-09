const isJson = (str: string) => {
  try {
    JSON.parse(str);
  } catch (e) {
    return false;
  }
  return true;
};

type TMessageLimit = {
  max: number;
  windowInMinutes: number;
};

type TConcurrent = {
  limit: number;
};

const errorMessages = {
  invalid_api_key:
    'Invalid API key. Please check your API key and try again. You can do this by clicking on the model logo in the left corner of the textbox and selecting "Set Token" for the current selected endpoint. Thank you for your understanding.',
  insufficient_quota:
    'We apologize for any inconvenience caused. The default API key has reached its limit. To continue using this service, please set up your own API key. You can do this by clicking on the model logo in the left corner of the textbox and selecting "Set Token" for the current selected endpoint. Thank you for your understanding.',
  concurrent: (json: TConcurrent) =>
    `Only ${json.limit} message(s) at a time. Please allow any other responses to complete before sending another message, or wait one minute.`,
  message_limit: (json: TMessageLimit) =>
    `You hit the message limit. You have a cap of ${json.max} messages per ${
      json.windowInMinutes > 1 ? `${json.windowInMinutes} minutes` : 'minute'
    }.`,
};

const getError = (text: string) => {
  const errorMessage = text.length > 512 ? text.slice(0, 512) + '...' : text;
  const match = text.match(/\{[^{}]*\}/);
  const jsonString = match ? match[0] : '';
  const defaultResponse = `Something went wrong. Here's the specific error message we encountered: ${errorMessage}`;

  if (!isJson(jsonString)) {
    return defaultResponse;
  }

  const json = JSON.parse(jsonString);
  const errorKey = json.code || json.type;
  const keyExists = errorKey && errorMessages[errorKey];

  if (keyExists && typeof errorMessages[errorKey] === 'function') {
    return errorMessages[errorKey](json);
  } else if (keyExists) {
    return errorMessages[errorKey];
  } else {
    return defaultResponse;
  }
};

export default getError;
