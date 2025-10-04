import { FileSources } from 'librechat-data-provider';
import type { AppConfig } from '~/types/config';
import { initializeAzureBlobService } from '~/cdn/azure';
import { initializeFirebase } from '~/cdn/firebase';
import { initializeS3 } from '~/cdn/s3';

/**
 * Initializes file storage clients based on the configured file strategy.
 * This should be called after loading the app configuration.
 * @param {Object} options
 * @param {AppConfig} options.appConfig - The application configuration
 */
export function initializeFileStorage(appConfig: AppConfig) {
  const { fileStrategy } = appConfig;

  if (fileStrategy === FileSources.firebase) {
    initializeFirebase();
  } else if (fileStrategy === FileSources.azure_blob) {
    initializeAzureBlobService();
  } else if (fileStrategy === FileSources.s3) {
    initializeS3();
  }
}
