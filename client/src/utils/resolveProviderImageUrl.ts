export default function resolveProviderImageUrl(imageUrl?: string | null) {
  if (!imageUrl) {
    return undefined;
  }

  // Keep fully-qualified and data URLs untouched.
  if (/^(?:[a-z]+:)?\/\//i.test(imageUrl) || imageUrl.startsWith('data:')) {
    return imageUrl;
  }

  // Preserve root-relative public asset paths as-is so they resolve against the app origin.
  if (imageUrl.startsWith('/')) {
    return imageUrl;
  }

  if (typeof document === 'undefined') {
    return `/${imageUrl}`;
  }

  return new URL(imageUrl, document.baseURI).toString();
}
