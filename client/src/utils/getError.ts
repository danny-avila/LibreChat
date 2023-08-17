import store from '~/store';
import { useRecoilValue } from 'recoil';
import { localize } from '~/localization/Translation';

const isJson = (str) => {
  try {
    JSON.parse(str);
  } catch (e) {
    return false;
  }
  return true;
}

const GetError = (text) => {
  const lang = useRecoilValue(store.lang);
  const errorMessage = text.length > 512 ? text.slice(0, 512) + '...' : text;
  const match = text.match(/\{[^{}]*\}/);
  let json = match ? match[0] : '';
  if (isJson(json)) {
    json = JSON.parse(json);
    if (json.code === 'invalid_api_key') {
      return  localize(lang, 'com_error_invalid_api_key');
    } else if (json.type === 'insufficient_quota') {
      return localize(lang, 'com_error_insufficient_quota');
    } else {
      return localize(lang, 'com_error_unknown', errorMessage);
    }
  } else {
    return localize(lang, 'com_error_unknown', errorMessage);
  }
};

export default GetError;