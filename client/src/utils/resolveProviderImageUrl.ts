export default function resolveProviderImageUrl(imageUrl?: string | null) {
  if (!imageUrl) {
    return undefined;
  }

  // Keep fully-qualified and data URLs untouched.
  if (/^(?:[a-z]+:)?\/\//i.test(imageUrl) || imageUrl.startsWith('data:')) {
    return imageUrl;
  }

  const normalizedPath = imageUrl.startsWith('/') ? imageUrl.slice(1) : imageUrl;

  if (typeof document === 'undefined') {
    return `/${normalizedPath}`;
  }

  return new URL(normalizedPath, document.baseURI).toString();
}
