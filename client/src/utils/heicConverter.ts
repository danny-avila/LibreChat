import { heicTo, isHeic } from 'heic-to';

/**
 * Check if a file is in HEIC format
 * @param file - The file to check
 * @returns Promise<boolean> - True if the file is HEIC
 */
export const isHEICFile = async (file: File): Promise<boolean> => {
  try {
    return await isHeic(file);
  } catch (error) {
    console.warn('Error checking if file is HEIC:', error);
    // Fallback to mime type check
    return file.type === 'image/heic' || file.type === 'image/heif';
  }
};

/**
 * Convert HEIC file to JPEG
 * @param file - The HEIC file to convert
 * @param quality - JPEG quality (0-1), default is 0.9
 * @returns Promise<File> - The converted JPEG file
 */
export const convertHEICToJPEG = async (file: File, quality: number = 0.9): Promise<File> => {
  try {
    const convertedBlob = await heicTo({
      blob: file,
      type: 'image/jpeg',
      quality,
    });

    // Create a new File object with the converted blob
    const convertedFile = new File(
      [convertedBlob],
      file.name.replace(/\.(heic|heif)$/i, '.jpg'),
      {
        type: 'image/jpeg',
        lastModified: file.lastModified,
      }
    );

    return convertedFile;
  } catch (error) {
    console.error('Error converting HEIC to JPEG:', error);
    throw new Error('Failed to convert HEIC image to JPEG');
  }
};

/**
 * Process a file, converting it from HEIC to JPEG if necessary
 * @param file - The file to process
 * @param quality - JPEG quality for conversion (0-1), default is 0.9
 * @returns Promise<File> - The processed file (converted if it was HEIC, original otherwise)
 */
export const processFileForUpload = async (file: File, quality: number = 0.9): Promise<File> => {
  const isHEIC = await isHEICFile(file);
  
  if (isHEIC) {
    console.log('HEIC file detected, converting to JPEG...');
    return convertHEICToJPEG(file, quality);
  }
  
  return file;
}; 