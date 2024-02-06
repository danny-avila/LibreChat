const WOFF = 'application/font-woff'
const JPEG = 'image/jpeg'
const mimes: { [key: string]: string } = {
  woff: WOFF,
  woff2: WOFF,
  ttf: 'application/font-truetype',
  eot: 'application/vnd.ms-fontobject',
  png: 'image/png',
  jpg: JPEG,
  jpeg: JPEG,
  gif: 'image/gif',
  tiff: 'image/tiff',
  svg: 'image/svg+xml',
  webp: 'image/webp',
}

function getExtension(url: string): string {
  const match = /\.([^./]*?)$/g.exec(url)
  return match ? match[1] : ''
}

export function getMimeType(url: string): string {
  const extension = getExtension(url).toLowerCase()
  return mimes[extension] || ''
}
