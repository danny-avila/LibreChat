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

    return !!(ctx && ctx.drawImage && canvas.toBlob);
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
export function resizeImage(
  file: File,
  options: Partial<ResizeOptions> = {},
): Promise<ResizeResult> {
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

    const opts = { ...DEFAULT_RESIZE_OPTIONS, ...options };
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
 * Determines if an image should be resized based on size and dimensions
 */
export function shouldResizeImage(
  file: File,
  fileSizeLimit: number = 512 * 1024 * 1024, // 512MB default
): boolean {
  // Don't resize if file is already small
  if (file.size < fileSizeLimit * 0.1) {
    // Less than 10% of limit
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
