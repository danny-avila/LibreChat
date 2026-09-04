const { AsyncLocalStorage } = require('async_hooks');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const mime = require('mime');
const paths = require('../../config/paths');

const requestStorage = new AsyncLocalStorage();

// Helper to save base64 image data to local disk in a security-compliant folder structure
async function saveBase64ToDisk(base64Str, req) {
  try {
    if (typeof base64Str !== 'string') {
      return null;
    }
    const parts = base64Str.split(';base64,');
    let mimeType = 'image/png';
    let base64Data = base64Str;

    if (parts.length >= 2) {
      const mimePart = parts[0];
      mimeType = mimePart.startsWith('data:') ? mimePart.slice(5) : 'image/png';
      base64Data = parts.slice(1).join(';base64,');
    } else if (base64Str.startsWith('data:')) {
      return null;
    }

    const extension = mime.getExtension(mimeType) || 'png';
    const buffer = Buffer.from(base64Data, 'base64');
    const fileName = `img-${uuidv4()}.${extension}`;
    
    // Resolve user-scoped subfolder to comply with secureImageLinks and custom strategies
    const userId = req && req.user && req.user.id ? req.user.id : 'public';
    
    // Determine file strategy
    const appConfig = req && req.config ? req.config : null;
    let strategy = 'local';
    let saveBufferFn;
    
    if (appConfig) {
      const { getFileStrategy } = require('./getFileStrategy');
      const { getStrategyFunctions } = require('../services/Files/strategies');
      strategy = getFileStrategy(appConfig, { isImage: true });
      const strategyFunctions = getStrategyFunctions(strategy);
      saveBufferFn = strategyFunctions.saveBuffer;
    }

    if (saveBufferFn) {
      const tenantId = req && req.user && req.user.tenantId ? req.user.tenantId : undefined;
      const filepath = await saveBufferFn({
        userId,
        fileName,
        buffer,
        tenantId,
      });
      return filepath;
    } else {
      const targetDir = path.join(paths.imageOutput, userId);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      const filePath = path.join(targetDir, fileName);
      fs.writeFileSync(filePath, buffer);
      return `/images/${userId}/${fileName}`;
    }
  } catch (error) {
    console.error('Failed to save OpenRouter image to disk:', error);
    return null;
  }
}

// Helper to extract image URL from OpenRouter response formats
function getImageUrl(img) {
  if (!img) {
    return null;
  }
  if (typeof img === 'string') {
    return img;
  }
  if (img.image_url && typeof img.image_url === 'object' && img.image_url.url) {
    return img.image_url.url;
  }
  if (img.url) {
    return img.url;
  }
  return null;
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
          if (model && typeof model === 'string') {
            const modelLower = model.toLowerCase();
            if (
              modelLower.includes('image') ||
              modelLower.includes('banana') ||
              modelLower.includes('flux') ||
              modelLower.includes('stable-diffusion') ||
              modelLower.includes('riverflow') ||
              modelLower.includes('bfl')
            ) {
              body.modalities = ['image', 'text'];
              init.body = JSON.stringify(body);
            }
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

        const processLines = async (buffer, controller, isDone) => {
          const parts = buffer.split('\n');
          const lastIndex = parts.length - 1;
          const completeLines = isDone ? parts : parts.slice(0, lastIndex);
          const remaining = isDone ? '' : parts[lastIndex];

          const processedLines = [];
          for (const line of completeLines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.slice(6).trim();
              if (dataStr === '[DONE]') {
                processedLines.push(line);
                continue;
              }
              try {
                const data = JSON.parse(dataStr);
                const delta = data.choices?.[0]?.delta;
                if (delta && delta.images && delta.images.length > 0) {
                  const imagePaths = await Promise.all(
                    delta.images.map(async (img) => {
                      const imgUrl = getImageUrl(img);
                      if (imgUrl && (imgUrl.startsWith('data:') || imgUrl.startsWith('data%3A'))) {
                        const decodedUrl = imgUrl.startsWith('data%3A') || imgUrl.includes('%3Bbase64%2C') ? decodeURIComponent(imgUrl) : imgUrl;
                        const localPath = await saveBase64ToDisk(decodedUrl, currentReq);
                        return localPath ? `\n\n![Generated Image](${localPath})\n\n` : '';
                      }
                      return imgUrl ? `\n\n![Generated Image](${imgUrl})\n\n` : '';
                    })
                  );
                  const markdownImages = imagePaths.join('');
                  delta.content = (delta.content || '') + markdownImages;
                  delete delta.images;
                  processedLines.push(`data: ${JSON.stringify(data)}`);
                } else {
                  processedLines.push(line);
                }
              } catch (err) {
                processedLines.push(line);
              }
            } else {
              processedLines.push(line);
            }
          }

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
                    await processLines(buffer, controller, true);
                  }
                  controller.close();
                  break;
                }
                buffer += decoder.decode(value, { stream: true });
                buffer = await processLines(buffer, controller, false);
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
            const imagePaths = await Promise.all(
              message.images.map(async (img) => {
                const imgUrl = getImageUrl(img);
                if (imgUrl && (imgUrl.startsWith('data:') || imgUrl.startsWith('data%3A'))) {
                  const decodedUrl = imgUrl.startsWith('data%3A') || imgUrl.includes('%3Bbase64%2C') ? decodeURIComponent(imgUrl) : imgUrl;
                  const localPath = await saveBase64ToDisk(decodedUrl, currentReq);
                  return localPath ? `\n\n![Generated Image](${localPath})\n\n` : '';
                }
                return imgUrl ? `\n\n![Generated Image](${imgUrl})\n\n` : '';
              })
            );
            const markdownImages = imagePaths.join('');
            message.content = (message.content || '') + markdownImages;
            delete message.images;
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
