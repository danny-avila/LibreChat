import sharp from 'sharp';
import { FileSources } from 'librechat-data-provider';
import fs from 'fs';
import path from 'path';
import { getMethods, getSaveBufferStrategy } from '../initAuth';
import { logger } from '@librechat/data-schemas';
import { ProcessAvatarParams, ResizeAndConvertOptions, ResizeAvatarParams } from '../types/avatar';
const { EImageOutputType } = require('librechat-data-provider');

const defaultBasePath = 'images';

const getAvatarProcessFunction = (fileSource: string): Function => {
  if (fileSource === FileSources.firebase) {
    return processFirebaseAvatar;
  } else if (fileSource === FileSources.local) {
    return processLocalAvatar;
  } else if (fileSource === FileSources.azure_blob) {
    return processAzureAvatar;
  } else if (fileSource === FileSources.s3) {
    return processS3Avatar;
  } else {
    throw new Error('Invalid file source for saving avata');
  }
};

/**
 * Uploads a user's avatar to Firebase Storage and returns the URL.
 * If the 'manual' flag is set to 'true', it also updates the user's avatar URL in the database.
 *
 * @param {object} params - The parameters object.
 * @param {Buffer} params.buffer - The Buffer containing the avatar image.
 * @param {string} params.userId - The user ID.
 * @param {string} params.manual - A string flag indicating whether the update is manual ('true' or 'false').
 * @returns {Promise<string>} - A promise that resolves with the URL of the uploaded avatar.
 * @throws {Error} - Throws an error if Firebase is not initialized or if there is an error in uploading.
 */
async function processFirebaseAvatar({
  buffer,
  userId,
  manual,
}: ProcessAvatarParams): Promise<string> {
  try {
    const saveBufferToFirebase = getSaveBufferStrategy();
    const downloadURL = await saveBufferToFirebase({
      userId,
      buffer,
      fileName: 'avatar.png',
    });

    const isManual = manual === 'true';

    const url = `${downloadURL}?manual=${isManual}`;

    if (isManual) {
      const { updateUser } = getMethods();
      await updateUser(userId, { avatar: url });
    }

    return url;
  } catch (error) {
    logger.error('Error uploading profile picture:', error);
    throw error;
  }
}

/**
 * Uploads a user's avatar to local server storage and returns the URL.
 * If the 'manual' flag is set to 'true', it also updates the user's avatar URL in the database.
 *
 * @param {object} params - The parameters object.
 * @param {Buffer} params.buffer - The Buffer containing the avatar image.
 * @param {string} params.userId - The user ID.
 * @param {string} params.manual - A string flag indicating whether the update is manual ('true' or 'false').
 * @returns {Promise<string>} - A promise that resolves with the URL of the uploaded avatar.
 * @throws {Error} - Throws an error if Firebase is not initialized or if there is an error in uploading.
 */
async function processLocalAvatar({ buffer, userId, manual }: ProcessAvatarParams) {
  const userDir = path.resolve(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    '..',
    'client',
    'public',
    'images',
    userId,
  );

  const fileName = `avatar-${new Date().getTime()}.png`;
  const urlRoute = `/images/${userId}/${fileName}`;
  const avatarPath = path.join(userDir, fileName);

  await fs.promises.mkdir(userDir, { recursive: true });
  await fs.promises.writeFile(avatarPath, buffer);

  const isManual = manual === 'true';
  let url = `${urlRoute}?manual=${isManual}`;

  if (isManual) {
    const { updateUser } = getMethods();
    await updateUser(userId, { avatar: url });
  }

  return url;
}

/**
 * Processes a user's avatar image by uploading it to S3 and updating the user's avatar URL if required.
 *
 * @param {Object} params
 * @param {Buffer} params.buffer - Avatar image buffer.
 * @param {string} params.userId - User's unique identifier.
 * @param {string} params.manual - 'true' or 'false' flag for manual update.
 * @param {string} [params.basePath='images'] - Base path in the bucket.
 * @returns {Promise<string>} Signed URL of the uploaded avatar.
 */
async function processS3Avatar({
  buffer,
  userId,
  manual,
  basePath = defaultBasePath,
}: ProcessAvatarParams): Promise<string> {
  try {
    const saveBufferToS3 = getSaveBufferStrategy();
    const downloadURL = await saveBufferToS3({ userId, buffer, fileName: 'avatar.png', basePath });
    if (manual === 'true') {
      const { updateUser } = getMethods();
      await updateUser(userId, { avatar: downloadURL });
    }
    return downloadURL;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error('Error processing S3 avatar: ' + errorMessage);
  }
}

/**
 * Uploads and processes a user's avatar to Azure Blob Storage.
 *
 * @param {Object} params
 * @param {Buffer} params.buffer - The avatar image buffer.
 * @param {string} params.userId - The user's id.
 * @param {string} params.manual - Flag to indicate manual update.
 * @param {string} [params.basePath='images'] - The base folder within the container.
 * @param {string} [params.containerName] - The Azure Blob container name.
 * @returns {Promise<string>} The URL of the avatar.
 */
async function processAzureAvatar({
  buffer,
  userId,
  manual,
  basePath = 'images',
  containerName,
}: ProcessAvatarParams) {
  try {
    const saveBufferToAzure = getSaveBufferStrategy();
    const downloadURL = await saveBufferToAzure({
      userId,
      buffer,
      fileName: 'avatar.png',
      basePath,
      containerName,
    });
    const isManual = manual === 'true';
    const url = `${downloadURL}?manual=${isManual}`;
    if (isManual) {
      const { updateUser } = getMethods();
      await updateUser(userId, { avatar: url });
    }
    return url;
  } catch (error) {
    logger.error('[processAzureAvatar] Error uploading profile picture to Azure:', error);
    throw error;
  }
}

/**
 * Uploads an avatar image for a user. This function can handle various types of input (URL, Buffer, or File object),
 * processes the image to a square format, converts it to target format, and returns the resized buffer.
 *
 * @param {Object} params - The parameters object.
 * @param {string} params.userId - The unique identifier of the user for whom the avatar is being uploaded.
 * @param {string} options.desiredFormat - The desired output format of the image.
 * @param {(string|Buffer|File)} params.input - The input representing the avatar image. Can be a URL (string),
 *                                               a Buffer, or a File object.
 *
 * @returns {Promise<any>}
 *          A promise that resolves to a resized buffer.
 *
 * @throws {Error} Throws an error if the user ID is undefined, the input type is invalid, the image fetching fails,
 *                 or any other error occurs during the processing.
 */
async function resizeAvatar({
  userId,
  input,
  desiredFormat = EImageOutputType.PNG,
}: ResizeAvatarParams) {
  try {
    if (userId === undefined) {
      throw new Error('User ID is undefined');
    }

    let imageBuffer: Buffer;
    if (typeof input === 'string') {
      const response = await fetch(input);

      if (!response.ok) {
        throw new Error(`Failed to fetch image from URL. Status: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuffer);
    } else if (input instanceof Buffer) {
      imageBuffer = input;
    } else if (typeof input === 'object' && input instanceof File) {
      const fileContent = await fs.promises.readFile(input?.path);
      imageBuffer = Buffer.from(fileContent);
    } else {
      throw new Error('Invalid input type. Expected URL, Buffer, or File.');
    }

    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    const minSize = Math.min(width, height);

    if (metadata.format === 'gif') {
      const resizedBuffer = await sharp(imageBuffer, { animated: true })
        .extract({
          left: Math.floor((width - minSize) / 2),
          top: Math.floor((height - minSize) / 2),
          width: minSize,
          height: minSize,
        })
        .resize(250, 250)
        .gif()
        .toBuffer();

      return resizedBuffer;
    }

    const squaredBuffer = await sharp(imageBuffer)
      .extract({
        left: Math.floor((width - minSize) / 2),
        top: Math.floor((height - minSize) / 2),
        width: minSize,
        height: minSize,
      })
      .toBuffer();

    const buffer = await resizeAndConvert({
      inputBuffer: squaredBuffer,
      desiredFormat,
    });
    return buffer;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error('Error uploading the avatar: ' + errorMessage);
  }
}

/**
 * Resizes an image buffer to a specified format and width.
 *
 * @param {ResizeAndConvertOptions} options - The options for resizing and converting the image.
 * @returns {Buffer} An object containing the resized image buffer, its size, and dimensions.
 * @throws Will throw an error if the resolution or format parameters are invalid.
 */
async function resizeAndConvert({
  inputBuffer,
  desiredFormat,
  width = 150,
}: ResizeAndConvertOptions) {
  const resizedBuffer: Buffer = await sharp(inputBuffer)
    .resize({ width })
    .toFormat(desiredFormat as keyof sharp.FormatEnum)
    .toBuffer();

  return resizedBuffer;
}
export { resizeAvatar, resizeAndConvert, getAvatarProcessFunction };
