import { atom } from 'recoil';

// Check for language in localStorage first
// If no last selected language, set language to Chinese if browser language is Chinese
// Set language to English otherwise
const lang = atom({
  key: 'lang',
  default: window.localStorage.getItem('lang') || (navigator.languages[0] === 'zh-CN' ? 'cn' : 'en'),
});

export default { lang };