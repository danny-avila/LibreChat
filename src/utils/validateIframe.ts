export default function validateIframe(content: string): string | boolean | null {
  const hasValidIframe =
    content.includes('<iframe role="presentation" style="') &&
    content.includes('src="https://www.bing.com/images/create');

  if (!hasValidIframe) {
    return false;
  }

  const iframeRegex = /<iframe\s[^>]*?>/g;
  const iframeMatches = content.match(iframeRegex);

  if (!iframeMatches || iframeMatches.length > 1) {
    return false;
  }

  const parser = new DOMParser();
  const parsedHtml = parser.parseFromString(content, 'text/html');

  const potentiallyHarmfulTags = ['script', 'img', 'style', 'div', 'a', 'input', 'button', 'form'];
  for (const tag of potentiallyHarmfulTags) {
    const elements = parsedHtml.getElementsByTagName(tag);

    if (elements.length > 0) {
      return false;
    }
  }

  const iframes = parsedHtml.getElementsByTagName('iframe');

  if (iframes.length !== 1) {
    return false;
  }

  const iframe = iframes[0];

  // Verify role and src attributes
  const role = iframe.getAttribute('role');
  const src = iframe.getAttribute('src');

  return role === 'presentation' && src && src.startsWith('https://www.bing.com/images/create');
}
