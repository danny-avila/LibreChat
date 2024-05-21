const truncateRegex = /^([a-zA-Z0-9]{8})[a-zA-Z0-9]+([a-zA-Z0-9]{8})$/;

export const prettyEthAddress = (address: string) => {
  if (!address) {
    return '';
  }

  const match = address.match(truncateRegex);
  if (!match) {
    return address;
  }
  return `${match[1]}…${match[2]}`;
};
