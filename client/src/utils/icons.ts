const IMAGE_EXTENSION = /\.(png|jpe?g|gif|svg|webp|ico)(?:[?#].*)?$/i;

export function isImageURL(iconURL?: string | null): iconURL is string {
  if (!iconURL) {
    return false;
  }

  if (/^https?:\/\//i.test(iconURL) || /^data:image\/[a-z0-9.+-]+/i.test(iconURL)) {
    return true;
  }

  if (iconURL.startsWith('//')) {
    return /^\/\/[^/]/.test(iconURL);
  }

  return iconURL.startsWith('/') || IMAGE_EXTENSION.test(iconURL);
}
