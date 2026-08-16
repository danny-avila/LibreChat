/**
 * Client-side image resizing utility for LibreChat
 * Resizes images to prevent backend upload errors while maintaining quality
 */

export interface ResizeOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
}

export interface ResizeResult {
  file: File;
  originalSize: number;
  newSize: number;
  originalDimensions: { width: number; height: number };
  newDimensions: { width: number; height: number };
  compressionRatio: number;
}

type ResizeFormat = NonNullable<ResizeOptions['format']>;

/**
 * Default resize options based on backend 'high' resolution settings
 * Backend 'high' uses maxShortSide=768, maxLongSide=2000
 * We use slightly smaller values to ensure no backend resizing is triggered
 */
const DEFAULT_RESIZE_OPTIONS: ResizeOptions = {
  maxWidth: 1900, // Slightly less than backend maxLongSide=2000
  maxHeight: 1900, // Slightly less than backend maxLongSide=2000
  quality: 0.92, // High quality while reducing file size
  format: 'jpeg', // Most compatible format
};

const RESIZE_FORMAT_BY_MIME_TYPE: Record<string, ResizeFormat> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;
const WEBP_ANIMATION_FLAG = 0x02;

const readBytes = (file: File, start: number, length: number): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (!(reader.result instanceof ArrayBuffer)) {
        reject(new Error('Failed to read image container'));
        return;
      }
      resolve(new Uint8Array(reader.result));
    };
    reader.onerror = () => reject(new Error('Failed to read image container'));
    reader.readAsArrayBuffer(file.slice(start, start + length));
  });

const readAscii = (bytes: Uint8Array, start: number, length: number): string =>
  String.fromCharCode(...bytes.slice(start, start + length));

const hasSignature = (bytes: Uint8Array, signature: readonly number[]): boolean =>
  bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);

const isAnimatedPng = async (file: File): Promise<boolean> => {
  const signature = await readBytes(file, 0, PNG_SIGNATURE.length);
  if (!hasSignature(signature, PNG_SIGNATURE)) {
    return false;
  }

  let offset: number = PNG_SIGNATURE.length;
  while (offset + 12 <= file.size) {
    const header = await readBytes(file, offset, 8);
    if (header.length < 8) {
      return false;
    }

    const chunkLength = new DataView(header.buffer, header.byteOffset, header.byteLength).getUint32(
      0,
    );
    const chunkType = readAscii(header, 4, 4);
    const nextOffset = offset + 12 + chunkLength;
    if (nextOffset > file.size) {
      return false;
    }
    if (chunkType === 'acTL') {
      return true;
    }
    if (chunkType === 'IDAT' || chunkType === 'IEND') {
      return false;
    }

    offset = nextOffset;
  }

  return false;
};

const isAnimatedWebP = async (file: File): Promise<boolean> => {
  const signature = await readBytes(file, 0, 12);
  if (readAscii(signature, 0, 4) !== 'RIFF' || readAscii(signature, 8, 4) !== 'WEBP') {
    return false;
  }

  let offset = 12;
  while (offset + 8 <= file.size) {
    const header = await readBytes(file, offset, 8);
    if (header.length < 8) {
      return false;
    }

    const chunkType = readAscii(header, 0, 4);
    const chunkSize = new DataView(header.buffer, header.byteOffset, header.byteLength).getUint32(
      4,
      true,
    );
    const dataEnd = offset + 8 + chunkSize;
    if (dataEnd > file.size) {
      return false;
    }
    if (chunkType === 'ANIM' || chunkType === 'ANMF') {
      return true;
    }
    if (chunkType === 'VP8X' && chunkSize > 0) {
      const flags = await readBytes(file, offset + 8, 1);
      if (flags.length === 1 && (flags[0] & WEBP_ANIMATION_FLAG) !== 0) {
        return true;
      }
    }

    offset = dataEnd + (chunkSize % 2);
  }

  return false;
};

/** Checks image containers whose animation would be flattened by canvas. */
export const isAnimatedImage = async (file: File): Promise<boolean> => {
  if (file.type === 'image/apng') {
    return true;
  }
  if (file.type === 'image/png') {
    return isAnimatedPng(file);
  }
  if (file.type === 'image/webp') {
    return isAnimatedWebP(file);
  }
  return false;
};

/**
 * Checks if the browser supports canvas-based image resizing
 */
export function supportsClientResize(): boolean {
  try {
    // Check for required APIs
    if (typeof HTMLCanvasElement === 'undefined') return false;
    if (typeof FileReader === 'undefined') return false;
    if (typeof Image === 'undefined') return false;

    // Test canvas creation
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    return (
      ctx != null && typeof ctx.drawImage === 'function' && typeof canvas.toBlob === 'function'
    );
  } catch {
    return false;
  }
}

/**
 * Calculates new dimensions while maintaining aspect ratio
 */
function calculateDimensions(
  originalWidth: number,
  originalHeight: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  const { width, height } = { width: originalWidth, height: originalHeight };

  // If image is smaller than max dimensions, don't upscale
  if (width <= maxWidth && height <= maxHeight) {
    return { width, height };
  }

  // Calculate scaling factor
  const widthRatio = maxWidth / width;
  const heightRatio = maxHeight / height;
  const scalingFactor = Math.min(widthRatio, heightRatio);

  return {
    width: Math.round(width * scalingFactor),
    height: Math.round(height * scalingFactor),
  };
}

/**
 * Resizes an image file using canvas
 */
export async function resizeImage(
  file: File,
  options: Partial<ResizeOptions> = {},
): Promise<ResizeResult> {
  if (await isAnimatedImage(file)) {
    throw new Error('Animated images cannot be resized without losing animation');
  }

  return new Promise((resolve, reject) => {
    // Check browser support
    if (!supportsClientResize()) {
      reject(new Error('Browser does not support client-side image resizing'));
      return;
    }

    // Only process image files
    if (!file.type.startsWith('image/')) {
      reject(new Error('File is not an image'));
      return;
    }

    const sourceFormat = RESIZE_FORMAT_BY_MIME_TYPE[file.type];
    const opts = {
      ...DEFAULT_RESIZE_OPTIONS,
      format: sourceFormat ?? DEFAULT_RESIZE_OPTIONS.format,
      ...options,
    };
    const reader = new FileReader();

    reader.onload = (event) => {
      const img = new Image();

      img.onload = () => {
        try {
          const originalDimensions = { width: img.width, height: img.height };
          const newDimensions = calculateDimensions(
            img.width,
            img.height,
            opts.maxWidth!,
            opts.maxHeight!,
          );

          // If no resizing needed, return original file
          if (
            newDimensions.width === originalDimensions.width &&
            newDimensions.height === originalDimensions.height
          ) {
            resolve({
              file,
              originalSize: file.size,
              newSize: file.size,
              originalDimensions,
              newDimensions,
              compressionRatio: 1,
            });
            return;
          }

          // Create canvas and resize
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d')!;

          canvas.width = newDimensions.width;
          canvas.height = newDimensions.height;

          // Use high-quality image smoothing
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          // Draw resized image
          ctx.drawImage(img, 0, 0, newDimensions.width, newDimensions.height);

          // Convert to blob
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Failed to create blob from canvas'));
                return;
              }

              if (blob.size >= file.size) {
                resolve({
                  file,
                  originalSize: file.size,
                  newSize: file.size,
                  originalDimensions,
                  newDimensions: originalDimensions,
                  compressionRatio: 1,
                });
                return;
              }

              // Create new file with same name but potentially different extension
              const extension = opts.format === 'jpeg' ? '.jpg' : `.${opts.format}`;
              const baseName = file.name.replace(/\.[^/.]+$/, '');
              const newFileName = `${baseName}${extension}`;

              const resizedFile = new File([blob], newFileName, {
                type: `image/${opts.format}`,
                lastModified: Date.now(),
              });

              resolve({
                file: resizedFile,
                originalSize: file.size,
                newSize: resizedFile.size,
                originalDimensions,
                newDimensions,
                compressionRatio: resizedFile.size / file.size,
              });
            },
            `image/${opts.format}`,
            opts.quality,
          );
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = event.target?.result as string;
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Smallest file worth re-encoding. Below this the decode/encode round trip costs
 * more than it saves, and `resizeImage` already returns the original untouched
 * when the image fits within the configured dimensions.
 */
export const MIN_RESIZE_BYTES = 512 * 1024;

/**
 * Determines if an image is a candidate for resizing
 */
export function shouldResizeImage(file: File, minSizeBytes: number = MIN_RESIZE_BYTES): boolean {
  // Don't resize if file is already small
  if (file.size < minSizeBytes) {
    return false;
  }

  // Don't process non-images
  if (!file.type.startsWith('image/')) {
    return false;
  }

  // Don't process GIFs (they might be animated)
  if (file.type === 'image/gif') {
    return false;
  }

  return true;
}
