import {
  ARTIFACT_PREVIEW_MAX_URL_LENGTH,
  isAllowedArtifactPreviewUrl,
} from 'librechat-data-provider';
import type { ArtifactPreview } from 'librechat-data-provider';

const PREVIEW_REQUEST = 'librechat:artifact-preview:request';
const PREVIEW_RESPONSE = 'librechat:artifact-preview:response';
const PREVIEW_WIDTHS = [480, 400, 320, 240] as const;
const TRANSPARENT_COLORS = new Set(['transparent', 'rgba(0, 0, 0, 0)', 'rgba(0,0,0,0)']);

function encodePreviewCanvas(source: HTMLCanvasElement, backgroundColor: string): string | null {
  for (const width of PREVIEW_WIDTHS) {
    const height = Math.round((width * 2) / 3);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }

    context.fillStyle = TRANSPARENT_COLORS.has(backgroundColor) ? '#ffffff' : backgroundColor;
    context.fillRect(0, 0, width, height);
    const scale = Math.max(width / source.width, height / source.height);
    const renderedWidth = source.width * scale;
    const renderedHeight = source.height * scale;
    context.drawImage(source, (width - renderedWidth) / 2, 0, renderedWidth, renderedHeight);

    for (const [mimeType, quality] of [
      ['image/webp', 0.7],
      ['image/jpeg', 0.68],
    ] as const) {
      const imageUrl = canvas.toDataURL(mimeType, quality);
      if (
        imageUrl.length <= ARTIFACT_PREVIEW_MAX_URL_LENGTH &&
        isAllowedArtifactPreviewUrl(imageUrl)
      ) {
        return imageUrl;
      }
    }
  }
  return null;
}

/** Runs inside the sandboxed artifact frame and returns a rasterized viewport to its parent. */
function installArtifactPreviewBridge() {
  const requestType = 'librechat:artifact-preview:request';
  const responseType = 'librechat:artifact-preview:response';
  const maximumLength = 75_000;
  const previewWidths = [480, 400, 320, 240];
  const bridgeWindow = window as Window & { __libreChatArtifactPreviewBridge?: boolean };
  if (bridgeWindow.__libreChatArtifactPreviewBridge) {
    return;
  }
  bridgeWindow.__libreChatArtifactPreviewBridge = true;
  const pendingRequests = new Set<string>();

  const waitForSettledDom = () =>
    new Promise<void>((resolve) => {
      let idleTimer = 0;
      let maximumTimer = 0;
      const observer = new MutationObserver(() => {
        window.clearTimeout(idleTimer);
        idleTimer = window.setTimeout(done, 350);
      });
      const done = () => {
        window.clearTimeout(idleTimer);
        window.clearTimeout(maximumTimer);
        observer.disconnect();
        resolve();
      };
      observer.observe(document.documentElement, {
        attributes: true,
        childList: true,
        subtree: true,
      });
      idleTimer = window.setTimeout(done, 350);
      maximumTimer = window.setTimeout(done, 2_500);
    });

  const loadImage = (url: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Unable to rasterize artifact preview'));
      image.src = url;
    });

  const capture = async (): Promise<string | null> => {
    await waitForSettledDom();
    const width = Math.max(document.documentElement.clientWidth, window.innerWidth, 1);
    const height = Math.max(document.documentElement.clientHeight, window.innerHeight, 1);
    const clone = document.documentElement.cloneNode(true) as HTMLElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    clone.style.width = `${width}px`;
    clone.style.height = `${height}px`;
    clone.style.overflow = 'hidden';
    clone.querySelectorAll('script, iframe, video, audio, link').forEach((node) => node.remove());
    clone.querySelectorAll('img').forEach((image) => {
      if (!/^data:image\/(?:png|jpeg|webp);base64,/i.test(image.getAttribute('src') ?? '')) {
        image.remove();
      }
    });
    const sourceCanvases = document.documentElement.querySelectorAll('canvas');
    clone.querySelectorAll('canvas').forEach((canvas, index) => {
      try {
        const image = document.createElement('img');
        image.src = sourceCanvases[index]?.toDataURL('image/png') ?? '';
        image.alt = '';
        image.width = canvas.width;
        image.height = canvas.height;
        canvas.replaceWith(image);
      } catch {
        canvas.remove();
      }
    });

    const serialized = new XMLSerializer().serializeToString(clone);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${serialized}</foreignObject></svg>`;
    const objectUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    try {
      const image = await loadImage(objectUrl);
      const computedBackground = getComputedStyle(document.body).backgroundColor;
      const backgroundColor =
        !computedBackground ||
        computedBackground === 'transparent' ||
        computedBackground === 'rgba(0, 0, 0, 0)'
          ? '#ffffff'
          : computedBackground;

      for (const previewWidth of previewWidths) {
        const previewHeight = Math.round((previewWidth * 2) / 3);
        const canvas = document.createElement('canvas');
        canvas.width = previewWidth;
        canvas.height = previewHeight;
        const context = canvas.getContext('2d');
        if (!context) {
          return null;
        }
        context.fillStyle = backgroundColor;
        context.fillRect(0, 0, previewWidth, previewHeight);
        const scale = Math.max(previewWidth / width, previewHeight / height);
        const renderedWidth = width * scale;
        const renderedHeight = height * scale;
        context.drawImage(
          image,
          (previewWidth - renderedWidth) / 2,
          0,
          renderedWidth,
          renderedHeight,
        );

        for (const [mimeType, quality] of [
          ['image/webp', 0.7],
          ['image/jpeg', 0.68],
        ] as const) {
          const imageUrl = canvas.toDataURL(mimeType, quality);
          if (imageUrl.length <= maximumLength) {
            return imageUrl;
          }
        }
      }
      return null;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || event.data?.type !== requestType) {
      return;
    }
    const requestId = event.data.requestId;
    if (typeof requestId !== 'string' || pendingRequests.has(requestId)) {
      return;
    }
    pendingRequests.add(requestId);
    void capture()
      .catch(() => null)
      .then((imageUrl) => {
        window.parent.postMessage({ type: responseType, requestId, imageUrl }, '*');
      })
      .finally(() => {
        pendingRequests.delete(requestId);
      });
  });
}

export const ARTIFACT_PREVIEW_BRIDGE_SCRIPT = `;(${installArtifactPreviewBridge.toString()})();`;

function createRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

export function requestArtifactPreviewFromFrame(
  frame: HTMLIFrameElement,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<string | null> {
  const frameWindow = frame.contentWindow;
  if (!frameWindow || signal?.aborted) {
    return Promise.resolve(null);
  }
  const requestId = createRequestId();

  return new Promise((resolve) => {
    let retryTimer = 0;
    let timeoutTimer = 0;
    const cleanup = () => {
      window.clearInterval(retryTimer);
      window.clearTimeout(timeoutTimer);
      window.removeEventListener('message', handleMessage);
      signal?.removeEventListener('abort', handleAbort);
    };
    const finish = (imageUrl: string | null) => {
      cleanup();
      resolve(imageUrl);
    };
    const handleAbort = () => finish(null);
    const handleMessage = (event: MessageEvent) => {
      if (
        event.source !== frameWindow ||
        event.data?.type !== PREVIEW_RESPONSE ||
        event.data?.requestId !== requestId
      ) {
        return;
      }
      const imageUrl = event.data.imageUrl;
      finish(
        typeof imageUrl === 'string' && isAllowedArtifactPreviewUrl(imageUrl) ? imageUrl : null,
      );
    };
    const request = () => frameWindow.postMessage({ type: PREVIEW_REQUEST, requestId }, '*');

    window.addEventListener('message', handleMessage);
    signal?.addEventListener('abort', handleAbort, { once: true });
    retryTimer = window.setInterval(request, 300);
    timeoutTimer = window.setTimeout(() => finish(null), timeoutMs);
    request();
  });
}

export async function captureArtifactPreview(
  element: HTMLElement,
  mode: 'element' | 'frame',
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<string | null> {
  if (signal?.aborted) {
    return null;
  }
  if (mode === 'frame') {
    const deadline = Date.now() + timeoutMs;
    while (!signal?.aborted && Date.now() < deadline) {
      const frame = element.querySelector('iframe');
      if (frame) {
        return requestArtifactPreviewFromFrame(frame, Math.max(deadline - Date.now(), 1), signal);
      }
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    return null;
  }

  try {
    const { toCanvas } = await import('html-to-image');
    const canvas = await toCanvas(element, {
      pixelRatio: 1,
      skipFonts: true,
      imagePlaceholder:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      filter: (node) => {
        if (node.tagName !== 'IMG') {
          return true;
        }
        return isAllowedArtifactPreviewUrl(node.getAttribute('src') ?? '');
      },
    });
    if (signal?.aborted || !canvas.width || !canvas.height) {
      return null;
    }
    const backgroundColor = getComputedStyle(element).backgroundColor || '#ffffff';
    return encodePreviewCanvas(canvas, backgroundColor);
  } catch {
    return null;
  }
}

export function toArtifactPreview(imageUrl: string, alt?: string): ArtifactPreview | undefined {
  if (!isAllowedArtifactPreviewUrl(imageUrl)) {
    return undefined;
  }
  return { type: 'image', imageUrl, ...(alt ? { alt } : {}) };
}
