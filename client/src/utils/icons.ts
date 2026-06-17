export function isImageURL(iconURL?: string | null): iconURL is string {
  if (!iconURL) {
    return false;
  }

  return /^https?:\/\//i.test(iconURL) || (iconURL.startsWith('/') && !iconURL.startsWith('//'));
}

export function isSvgIcon(iconURL?: string | null): iconURL is string {
  if (!iconURL) {
    return false;
  }

  if (/^data:image\/svg\+xml/i.test(iconURL)) {
    return true;
  }

  const path = iconURL.split(/[?#]/)[0];
  return /\.svg$/i.test(path);
}
