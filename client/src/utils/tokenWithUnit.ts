export const convertTokenToUnitString = (token: number) => {
  if (token >= 1e9) {
    return (token / 1e9).toFixed(2) + 'b';
  } else if (token >= 1e6) {
    return (token / 1e6).toFixed(2) + 'm';
  } else if (token >= 1e3) {
    return (token / 1e3).toFixed(2) + 'k';
  } else {
    return token;
  }
};
