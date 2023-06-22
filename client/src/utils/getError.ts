
const isJson = (str) => {
  try {
    JSON.parse(str);
  } catch (e) {
    return false;
  }
  return true;
}

const getError = (text) => {
  const errorMessage = text.length > 512 ? text.slice(0, 512) + '...' : text;
  const match = text.match(/\{[^{}]*\}/);
  let json = match ? match[0] : '';
  
  if (isJson(json)) {
    json = JSON.parse(errorMessage);
    
    if (json.code === 'invalid_api_key') {
      return 'Invalid API key. Please check your API key and try again. You can do this by clicking on the model logo in the left corner of the textbox and selecting "Set Token" for the current selected endpoint. Thank you for your understanding.';
    } else if (json.type === 'insufficient_quota') {
      return 'We apologize for any inconvenience caused. The default API key has reached its limit. To continue using this service, please set up your own API key. You can do this by clicking on the model logo in the left corner of the textbox and selecting "Set Token" for the current selected endpoint. Thank you for your understanding.';
    } else if (json.text === 'Rate limit exceeded. You can send 3 messages per day.') {
      return 'Rate limit exceeded. You can send 25 messages per day. Please wait until tomorrow or use a different account.';
    } else {
      return `Oops! Something went wrong. Please try again in a few moments. Here's the specific error message we encountered: ${errorMessage}`;
    }
  } else {
    return `Oops! Something went wrong. Please try again in a few moments. Here's the specific error message we encountered: ${errorMessage}`;
  }
};

export default getError;