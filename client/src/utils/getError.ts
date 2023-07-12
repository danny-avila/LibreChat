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
    json = JSON.parse(json);
    if (json.code === 'invalid_api_key') {
      return 'Invalid API key. Please check your API key and try again. You can do this by clicking on the model logo in the left corner of the textbox and selecting "Set Token" for the current selected endpoint. Thank you for your understanding.';
    } else if (json.code === 'subscription_required') {
      return 'The gpt-4 model is only available to subscribed users. Please subscribe to continue using this model.';
    } else if (json.text) {
      return json.text;
    } else {
      return `Oops! Something went wrong. Please try again in a few moments. Here's the specific error message we encountered: ${errorMessage}`;
    }
  } else {
    return `Oops! Something went wrong. Please try again in a few moments. Here's the specific error message we encountered: ${errorMessage}`;
  }
};

export default getError;
