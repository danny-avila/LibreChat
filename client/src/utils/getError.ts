
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
      return  navigator.languages[0] === 'zh-CN'
        ? '无效的API密钥。请检查您的API密钥，然后重试。您可以通过单击文本框左角的模型徽标，然后为当前选定的端点选择“设置令牌”来执行此操作。感谢您的理解。'
        : 'Invalid API key. Please check your API key and try again. You can do this by clicking on the model logo in the left corner of the textbox and selecting "Set Token" for the current selected endpoint. Thank you for your understanding.';
    } else if (json.type === 'insufficient_quota') {
      return navigator.languages[0] === 'zh-CN'
        ? '对于由此造成的任何不便，我们深表歉意。默认API已达到其极限。要继续使用此服务，请设置您自己的API密钥。您可以通过单击文本框左角的模型徽标并为当前选定的端点选择“设置令牌”来做到这一点。感谢您的理解。' 
        : 'We apologize for any inconvenience caused. The default API key has reached its limit. To continue using this service, please set up your own API key. You can do this by clicking on the model logo in the left corner of the textbox and selecting "Set Token" for the current selected endpoint. Thank you for your understanding.';
    } else {
      return navigator.languages[0] === 'zh-CN'
        ? `哎呀！出了问题。请稍后重试。这是我们遇到的具体错误消息： ${errorMessage}`
        : `Oops! Something went wrong. Please try again in a few moments. Here's the specific error message we encountered: ${errorMessage}`;
    }
  } else {
    return navigator.languages[0] === 'zh-CN'
      ? `哎呀！出了问题。请稍后重试。这是我们遇到的具体错误消息： ${errorMessage}`
      : `Oops! Something went wrong. Please try again in a few moments. Here's the specific error message we encountered: ${errorMessage}`;
  }
};

export default getError;