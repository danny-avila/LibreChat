
export const isMiniWechat  = () => {
  const ua = window.navigator.userAgent.toLowerCase();
  return /miniProgram/i.test(ua) || /micromessenger/i.test(ua);
};
