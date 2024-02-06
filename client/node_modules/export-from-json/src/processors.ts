import type { ExportType } from './types.js'

export function generateDataURI (content: string, type: ExportType, byBlob: boolean): string {
  switch (type) {
    case 'txt': {
      const blobType = 'text/plain;charset=utf-8'

      if (byBlob) return URL.createObjectURL(new Blob([content], { type: blobType }))

      return `data:,${blobType}` + encodeURIComponent(content)
    }
    case 'css': {
      const blobType = 'text/css;charset=utf-8'

      if (byBlob) return URL.createObjectURL(new Blob([content], { type: blobType }))

      return `data:,${blobType}` + encodeURIComponent(content)
    }
    case 'html': {
      const blobType = 'text/html;charset=utf-8'

      if (byBlob) return URL.createObjectURL(new Blob([content], { type: blobType }))

      return `data:,${blobType}` + encodeURIComponent(content)
    }
    case 'json': {
      const blobType = 'text/json;charset=utf-8'

      if (byBlob) return URL.createObjectURL(new Blob([content], { type: blobType }))

      return `data:,${blobType}` + encodeURIComponent(content)
    }
    case 'csv': {
      const blobType = 'text/csv;charset=utf-8'

      if (byBlob) return URL.createObjectURL(new Blob([content], { type: blobType }))

      return `data:,${blobType}` + encodeURIComponent(content)
    }
    case 'xls': {
      const blobType = 'text/application/vnd.ms-excel;charset=utf-8'

      if (byBlob) return URL.createObjectURL(new Blob([content], { type: blobType }))

      return `data:,${blobType}` + encodeURIComponent(content)
    }
    case 'xml': {
      const blobType = 'text/application/xml;charset=utf-8'

      if (byBlob) return URL.createObjectURL(new Blob([content], { type: blobType }))

      return `data:,${blobType}` + encodeURIComponent(content)
    }
    default : {
      return ''
    }
  }
}

export function downloadFile (content: string, type: ExportType, fileName: string = 'download', byBlob = true): void {
  const dataURI = generateDataURI(content, type, byBlob)

  const anchor = document.createElement('a')
  anchor.href = dataURI

  anchor.download = fileName
  anchor.setAttribute('style', 'visibility:hidden')

  document.body.appendChild(anchor)
  anchor.dispatchEvent(
    new MouseEvent('click', {
      bubbles: false,
      cancelable: false,
      view: window,
    }),
  )
  document.body.removeChild(anchor)
}
