import type { Options } from './types'
import { clonePseudoElements } from './clone-pseudos'
import { createImage, toArray, isInstanceOfElement } from './util'
import { getMimeType } from './mimes'
import { resourceToDataURL } from './dataurl'

async function cloneCanvasElement(canvas: HTMLCanvasElement) {
  const dataURL = canvas.toDataURL()
  if (dataURL === 'data:,') {
    return canvas.cloneNode(false) as HTMLCanvasElement
  }
  return createImage(dataURL)
}

async function cloneVideoElement(video: HTMLVideoElement, options: Options) {
  if (video.currentSrc) {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    canvas.width = video.clientWidth
    canvas.height = video.clientHeight
    ctx?.drawImage(video, 0, 0, canvas.width, canvas.height)
    const dataURL = canvas.toDataURL()
    return createImage(dataURL)
  }

  const poster = video.poster
  const contentType = getMimeType(poster)
  const dataURL = await resourceToDataURL(poster, contentType, options)
  return createImage(dataURL)
}

async function cloneIFrameElement(iframe: HTMLIFrameElement) {
  try {
    if (iframe?.contentDocument?.body) {
      return (await cloneNode(
        iframe.contentDocument.body,
        {},
        true,
      )) as HTMLBodyElement
    }
  } catch {
    // Failed to clone iframe
  }

  return iframe.cloneNode(false) as HTMLIFrameElement
}

async function cloneSingleNode<T extends HTMLElement>(
  node: T,
  options: Options,
): Promise<HTMLElement> {
  if (isInstanceOfElement(node, HTMLCanvasElement)) {
    return cloneCanvasElement(node)
  }

  if (isInstanceOfElement(node, HTMLVideoElement)) {
    return cloneVideoElement(node, options)
  }

  if (isInstanceOfElement(node, HTMLIFrameElement)) {
    return cloneIFrameElement(node)
  }

  return node.cloneNode(false) as T
}

const isSlotElement = (node: HTMLElement): node is HTMLSlotElement =>
  node.tagName != null && node.tagName.toUpperCase() === 'SLOT'

async function cloneChildren<T extends HTMLElement>(
  nativeNode: T,
  clonedNode: T,
  options: Options,
): Promise<T> {
  let children: T[] = []

  if (isSlotElement(nativeNode) && nativeNode.assignedNodes) {
    children = toArray<T>(nativeNode.assignedNodes())
  } else if (
    isInstanceOfElement(nativeNode, HTMLIFrameElement) &&
    nativeNode.contentDocument?.body
  ) {
    children = toArray<T>(nativeNode.contentDocument.body.childNodes)
  } else {
    children = toArray<T>((nativeNode.shadowRoot ?? nativeNode).childNodes)
  }

  if (
    children.length === 0 ||
    isInstanceOfElement(nativeNode, HTMLVideoElement)
  ) {
    return clonedNode
  }

  await children.reduce(
    (deferred, child) =>
      deferred
        .then(() => cloneNode(child, options))
        .then((clonedChild: HTMLElement | null) => {
          if (clonedChild) {
            clonedNode.appendChild(clonedChild)
          }
        }),
    Promise.resolve(),
  )

  return clonedNode
}

function cloneCSSStyle<T extends HTMLElement>(nativeNode: T, clonedNode: T) {
  const targetStyle = clonedNode.style
  if (!targetStyle) {
    return
  }

  const sourceStyle = window.getComputedStyle(nativeNode)
  if (sourceStyle.cssText) {
    targetStyle.cssText = sourceStyle.cssText
    targetStyle.transformOrigin = sourceStyle.transformOrigin
  } else {
    toArray<string>(sourceStyle).forEach((name) => {
      let value = sourceStyle.getPropertyValue(name)
      if (name === 'font-size' && value.endsWith('px')) {
        const reducedFont =
          Math.floor(parseFloat(value.substring(0, value.length - 2))) - 0.1
        value = `${reducedFont}px`
      }

      if (
        isInstanceOfElement(nativeNode, HTMLIFrameElement) &&
        name === 'display' &&
        value === 'inline'
      ) {
        value = 'block'
      }
      
      if (name === 'd' && clonedNode.getAttribute('d')) {
        value = `path(${clonedNode.getAttribute('d')})`
      }
      
      targetStyle.setProperty(
        name,
        value,
        sourceStyle.getPropertyPriority(name),
      )
    })
  }
}

function cloneInputValue<T extends HTMLElement>(nativeNode: T, clonedNode: T) {
  if (isInstanceOfElement(nativeNode, HTMLTextAreaElement)) {
    clonedNode.innerHTML = nativeNode.value
  }

  if (isInstanceOfElement(nativeNode, HTMLInputElement)) {
    clonedNode.setAttribute('value', nativeNode.value)
  }
}

function cloneSelectValue<T extends HTMLElement>(nativeNode: T, clonedNode: T) {
  if (isInstanceOfElement(nativeNode, HTMLSelectElement)) {
    const clonedSelect = clonedNode as any as HTMLSelectElement
    const selectedOption = Array.from(clonedSelect.children).find(
      (child) => nativeNode.value === child.getAttribute('value'),
    )

    if (selectedOption) {
      selectedOption.setAttribute('selected', '')
    }
  }
}

function decorate<T extends HTMLElement>(nativeNode: T, clonedNode: T): T {
  if (isInstanceOfElement(clonedNode, Element)) {
    cloneCSSStyle(nativeNode, clonedNode)
    clonePseudoElements(nativeNode, clonedNode)
    cloneInputValue(nativeNode, clonedNode)
    cloneSelectValue(nativeNode, clonedNode)
  }

  return clonedNode
}

async function ensureSVGSymbols<T extends HTMLElement>(
  clone: T,
  options: Options,
) {
  const uses = clone.querySelectorAll ? clone.querySelectorAll('use') : []
  if (uses.length === 0) {
    return clone
  }

  const processedDefs: { [key: string]: HTMLElement } = {}
  for (let i = 0; i < uses.length; i++) {
    const use = uses[i]
    const id = use.getAttribute('xlink:href')
    if (id) {
      const exist = clone.querySelector(id)
      const definition = document.querySelector(id) as HTMLElement
      if (!exist && definition && !processedDefs[id]) {
        // eslint-disable-next-line no-await-in-loop
        processedDefs[id] = (await cloneNode(definition, options, true))!
      }
    }
  }

  const nodes = Object.values(processedDefs)
  if (nodes.length) {
    const ns = 'http://www.w3.org/1999/xhtml'
    const svg = document.createElementNS(ns, 'svg')
    svg.setAttribute('xmlns', ns)
    svg.style.position = 'absolute'
    svg.style.width = '0'
    svg.style.height = '0'
    svg.style.overflow = 'hidden'
    svg.style.display = 'none'

    const defs = document.createElementNS(ns, 'defs')
    svg.appendChild(defs)

    for (let i = 0; i < nodes.length; i++) {
      defs.appendChild(nodes[i])
    }

    clone.appendChild(svg)
  }

  return clone
}

export async function cloneNode<T extends HTMLElement>(
  node: T,
  options: Options,
  isRoot?: boolean,
): Promise<T | null> {
  if (!isRoot && options.filter && !options.filter(node)) {
    return null
  }

  return Promise.resolve(node)
    .then((clonedNode) => cloneSingleNode(clonedNode, options) as Promise<T>)
    .then((clonedNode) => cloneChildren(node, clonedNode, options))
    .then((clonedNode) => decorate(node, clonedNode))
    .then((clonedNode) => ensureSVGSymbols(clonedNode, options))
}
