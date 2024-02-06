import { Options } from './types'

export function applyStyle<T extends HTMLElement>(
  node: T,
  options: Options,
): T {
  const { style } = node

  if (options.backgroundColor) {
    style.backgroundColor = options.backgroundColor
  }

  if (options.width) {
    style.width = `${options.width}px`
  }

  if (options.height) {
    style.height = `${options.height}px`
  }

  const manual = options.style
  if (manual != null) {
    Object.keys(manual).forEach((key: any) => {
      style[key] = manual[key] as string
    })
  }

  return node
}
