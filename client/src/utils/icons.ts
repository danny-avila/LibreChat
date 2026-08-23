export function isImageURL(iconURL?: string | null): iconURL is string {
  if (!iconURL) {
    return false;
  }

  return (
    /^https?:\/\//i.test(iconURL) ||
    (iconURL.startsWith('/') && !iconURL.startsWith('//')) ||
    (!iconURL.startsWith('//') && /\.(png|jpe?g|gif|svg|webp|ico)(\?.*)?$/i.test(iconURL))
  );
}
