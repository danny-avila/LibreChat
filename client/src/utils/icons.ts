export function isImageURL(iconURL?: string | null): iconURL is string {
  if (!iconURL) {
    return false;
  }

  return /^https?:\/\//i.test(iconURL) || (iconURL.startsWith('/') && !iconURL.startsWith('//'));
}
