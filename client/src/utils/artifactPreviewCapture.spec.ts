import {
  ARTIFACT_PREVIEW_BRIDGE_SCRIPT,
  requestArtifactPreviewFromFrame,
  toArtifactPreview,
} from './artifactPreviewCapture';

const pngPreview =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

describe('artifact preview capture', () => {
  it('creates preview metadata only for a self-contained validated raster', () => {
    expect(toArtifactPreview(pngPreview, 'Revenue chart')).toEqual({
      type: 'image',
      imageUrl: pngPreview,
      alt: 'Revenue chart',
    });
    expect(toArtifactPreview('https://attacker.example/pixel.png')).toBeUndefined();
  });

  it('installs the nonce-scoped bridge in artifact frames', () => {
    expect(ARTIFACT_PREVIEW_BRIDGE_SCRIPT).toContain('librechat:artifact-preview:request');
    expect(ARTIFACT_PREVIEW_BRIDGE_SCRIPT).toContain('requestId');
  });

  it('accepts a validated preview only from the requested artifact frame', async () => {
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    const frameWindow = frame.contentWindow as Window;
    const postMessage = jest.spyOn(frameWindow, 'postMessage').mockImplementation((message) => {
      window.setTimeout(() => {
        const event = new MessageEvent('message', {
          data: {
            type: 'librechat:artifact-preview:response',
            requestId: message.requestId,
            imageUrl: pngPreview,
          },
        });
        Object.defineProperty(event, 'source', { value: frameWindow });
        window.dispatchEvent(event);
      }, 0);
    });

    await expect(requestArtifactPreviewFromFrame(frame, 100)).resolves.toBe(pngPreview);
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'librechat:artifact-preview:request' }),
      '*',
    );
    frame.remove();
  });

  it('rejects an external preview returned by an artifact frame', async () => {
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    const frameWindow = frame.contentWindow as Window;
    jest.spyOn(frameWindow, 'postMessage').mockImplementation((message) => {
      window.setTimeout(() => {
        const event = new MessageEvent('message', {
          data: {
            type: 'librechat:artifact-preview:response',
            requestId: message.requestId,
            imageUrl: 'https://attacker.example/pixel.png',
          },
        });
        Object.defineProperty(event, 'source', { value: frameWindow });
        window.dispatchEvent(event);
      }, 0);
    });

    await expect(requestArtifactPreviewFromFrame(frame, 100)).resolves.toBeNull();
    frame.remove();
  });
});
