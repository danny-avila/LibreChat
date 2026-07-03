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

/**
 * True when an icon can be pixel-sampled without a cross-origin fetch: a
 * `data:` URI (self-contained) or a same-origin URL, including a root-relative
 * path. Cross-origin URLs are excluded so theme detection never silently
 * fetches a remote icon from every viewer's browser, which would both taint the
 * sampling canvas and act as a tracking beacon.
 */
export function isSameOriginOrDataIcon(iconURL?: string | null): iconURL is string {
  if (!iconURL) {
    return false;
  }

  if (/^data:/i.test(iconURL)) {
    return true;
  }

  if (iconURL.startsWith('/') && !iconURL.startsWith('//')) {
    return true;
  }

  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return new URL(iconURL, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}
