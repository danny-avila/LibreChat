const { AsyncLocalStorage } = require('async_hooks');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const mime = require('mime');
const paths = require('../../config/paths');

const requestStorage = new AsyncLocalStorage();

// Helper to save base64 image data to local disk in a security-compliant folder structure
function saveBase64ToDisk(base64Str, req) {
  try {
    const typeMatch = base64Str.match(/^data:([A-Za-z-+/]+);base64,/);
    const mimeType = typeMatch ? typeMatch[1] : 'image/png';
    const extension = mime.getExtension(mimeType) || 'png';
    const base64Data = base64Str.replace(/^data:[A-Za-z-+/]+;base64,/, '');

    if (!base64Data) {
      return null;
    }

    const buffer = Buffer.from(base64Data, 'base64');
    const fileName = `img-${uuidv4()}.${extension}`;
    
    // Resolve user-scoped subfolder to comply with secureImageLinks
    const userId = req && req.user && req.user.id ? req.user.id : 'public';
    const targetDir = path.join(paths.imageOutput, userId);
    
    // Ensure the folder exists
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const filePath = path.join(targetDir, fileName);
    fs.writeFileSync(filePath, buffer);

    return `/images/${userId}/${fileName}`;
  } catch (error) {
    console.error('Failed to save OpenRouter image to disk:', error);
    return null;
  }
}

const originalFetch = global.fetch;

if (typeof originalFetch === 'function') {
  global.fetch = async function (resource, init) {
    const url = typeof resource === 'string'
      ? resource
      : (resource && typeof resource === 'object' && 'url' in resource)
        ? resource.url
        : String(resource);

    // Only intercept requests targeting OpenRouter completions
    if (url && url.includes('openrouter.ai/api/v1/chat/completions')) {
      const currentReq = requestStorage.getStore();

      // 1. Intercept Request: Inject modalities parameter for image generation models
      if (init && init.body) {
        try {
          const body = JSON.parse(init.body);
          const model = body.model;
          if (
            model &&
            (model.includes('image') ||
              model.includes('banana') ||
              model.includes('flux') ||
              model.includes('stable-diffusion') ||
              model.includes('riverflow') ||
              model.includes('bfl')
          ) {
            body.modalities = ['image', 'text'];
            init.body = JSON.stringify(body);
          }
        } catch (e) {
          // Ignore JSON parse errors
        }
      }

      // Call the original fetch API
      const response = await originalFetch(resource, init);
      const contentType = response.headers.get('content-type') || '';

      // 2. Intercept Response (Streaming SSE)
      if (contentType.includes('text/event-stream') && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();

        const processLines = (buffer, controller, isDone) => {
          const parts = buffer.split('\n');
          const lastIndex = parts.length - 1;
          const completeLines = isDone ? parts : parts.slice(0, lastIndex);
          const remaining = isDone ? '' : parts[lastIndex];

          const processedLines = completeLines.map((line) => {
            if (line.startsWith('data: ')) {
              const dataStr = line.slice(6).trim();
              if (dataStr === '[DONE]') {
                return line;
              }
              try {
                const data = JSON.parse(dataStr);
                const delta = data.choices?.[0]?.delta;
                if (delta && delta.images && delta.images.length > 0) {
                  // Save all images to local storage and replace with absolute URLs
                  const markdownImages = delta.images
                    .map((img) => {
                      const imgUrl = img.image_url?.url || img.url;
                      if (imgUrl && imgUrl.startsWith('data:')) {
                        const localPath = saveBase64ToDisk(imgUrl, currentReq);
                        return localPath ? `\n\n![Generated Image](${localPath})\n\n` : '';
                      }
                      return imgUrl ? `\n\n![Generated Image](${imgUrl})\n\n` : '';
                    })
                    .join('');
                  delta.content = (delta.content || '') + markdownImages;
                  return `data: ${JSON.stringify(data)}`;
                }
              } catch (err) {
                // Ignore parse errors on incomplete chunks
              }
            }
            return line;
          });

          const output = processedLines.join('\n') + (completeLines.length > 0 ? '\n' : '');
          controller.enqueue(encoder.encode(output));
          return remaining;
        };

        const stream = new ReadableStream({
          async start(controller) {
            let buffer = '';
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) {
                  if (buffer) {
                    processLines(buffer, controller, true);
                  }
                  controller.close();
                  break;
                }
                buffer += decoder.decode(value, { stream: true });
                buffer = processLines(buffer, controller, false);
              }
            } catch (err) {
              controller.error(err);
            }
          },
        });

        return new Response(stream, {
          headers: response.headers,
          status: response.status,
          statusText: response.statusText,
        });
      }

      // 3. Intercept Response (Non-streaming JSON)
      if (contentType.includes('application/json')) {
        try {
          const clonedResponse = response.clone();
          const json = await clonedResponse.json();
          const message = json.choices?.[0]?.message;
          if (message && message.images && message.images.length > 0) {
            const markdownImages = message.images
              .map((img) => {
                const imgUrl = img.image_url?.url || img.url;
                if (imgUrl && imgUrl.startsWith('data:')) {
                  const localPath = saveBase64ToDisk(imgUrl, currentReq);
                  return localPath ? `\n\n![Generated Image](${localPath})\n\n` : '';
                }
                return imgUrl ? `\n\n![Generated Image](${imgUrl})\n\n` : '';
              })
              .join('');
            message.content = (message.content || '') + markdownImages;
            return new Response(JSON.stringify(json), {
              headers: response.headers,
              status: response.status,
              statusText: response.statusText,
            });
          }
        } catch (e) {
          // Fall back to original response on parse failure
        }
      }
    }

    return originalFetch(resource, init);
  };
}

module.exports = {
  requestContextMiddleware: (req, res, next) => {
    requestStorage.run(req, next);
  }
};
