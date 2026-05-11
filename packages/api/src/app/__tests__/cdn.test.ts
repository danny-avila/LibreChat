import { FileSources } from 'librechat-data-provider';

jest.mock('@librechat/data-schemas', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

jest.mock('~/cdn/firebase', () => ({
  initializeFirebase: jest.fn(),
}));

jest.mock('~/cdn/azure', () => ({
  initializeAzureBlobService: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('~/cdn/s3', () => ({
  initializeS3: jest.fn(),
}));

jest.mock('~/cdn/cloudfront', () => ({
  initializeCloudFront: jest.fn(),
}));

import type { AppConfig } from '@librechat/data-schemas';
import { initializeFileStorage } from '../cdn';
import { initializeFirebase } from '~/cdn/firebase';
import { initializeAzureBlobService } from '~/cdn/azure';
import { initializeS3 } from '~/cdn/s3';
import { initializeCloudFront } from '~/cdn/cloudfront';

const baseAppConfig: AppConfig = {
  config: {},
  fileStrategy: FileSources.local,
  imageOutputType: 'png',
};

describe('initializeFileStorage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('initializes S3 when fileStrategy is s3', () => {
    const appConfig = { ...baseAppConfig, fileStrategy: FileSources.s3 } as AppConfig;
    initializeFileStorage(appConfig);
    expect(initializeS3).toHaveBeenCalledTimes(1);
    expect(initializeFirebase).not.toHaveBeenCalled();
    expect(initializeCloudFront).not.toHaveBeenCalled();
  });

  it('initializes Firebase when fileStrategy is firebase', () => {
    const appConfig = { ...baseAppConfig, fileStrategy: FileSources.firebase } as AppConfig;
    initializeFileStorage(appConfig);
    expect(initializeFirebase).toHaveBeenCalledTimes(1);
    expect(initializeS3).not.toHaveBeenCalled();
    expect(initializeCloudFront).not.toHaveBeenCalled();
  });

  it('initializes strategy from fileStrategies when fileStrategy is local', () => {
    const appConfig = {
      ...baseAppConfig,
      fileStrategy: FileSources.local,
      fileStrategies: { avatar: FileSources.s3 },
    } as AppConfig;
    initializeFileStorage(appConfig);
    expect(initializeS3).toHaveBeenCalledTimes(1);
    expect(initializeFirebase).not.toHaveBeenCalled();
    expect(initializeCloudFront).not.toHaveBeenCalled();
  });

  it('does not initialize S3 twice when fileStrategy and fileStrategies both use s3', () => {
    const appConfig = {
      ...baseAppConfig,
      fileStrategy: FileSources.s3,
      fileStrategies: { image: FileSources.s3 },
    } as AppConfig;
    initializeFileStorage(appConfig);
    expect(initializeS3).toHaveBeenCalledTimes(1);
  });

  it('initializes multiple different strategies from fileStrategies', () => {
    const appConfig = {
      ...baseAppConfig,
      fileStrategy: FileSources.s3,
      fileStrategies: { avatar: FileSources.firebase },
    } as AppConfig;
    initializeFileStorage(appConfig);
    expect(initializeS3).toHaveBeenCalledTimes(1);
    expect(initializeFirebase).toHaveBeenCalledTimes(1);
  });

  it('initializes CloudFront with config when fileStrategy is cloudfront', () => {
    const cloudfrontConfig = { domain: 'https://d123.cloudfront.net' };
    const appConfig = {
      ...baseAppConfig,
      fileStrategy: FileSources.cloudfront,
      cloudfront: cloudfrontConfig,
    } as AppConfig;
    initializeFileStorage(appConfig);
    expect(initializeCloudFront).toHaveBeenCalledTimes(1);
    expect(initializeCloudFront).toHaveBeenCalledWith(cloudfrontConfig);
  });

  it('logs an error and does not initialize CloudFront when cloudfront config is absent', () => {
    const appConfig = {
      ...baseAppConfig,
      fileStrategy: FileSources.cloudfront,
    } as AppConfig;
    initializeFileStorage(appConfig);
    expect(initializeCloudFront).not.toHaveBeenCalled();
  });

  it('initializes CloudFront from fileStrategies when fileStrategy is local, but avatar is configured for CloudFront', () => {
    const cloudfrontConfig = { domain: 'https://d123.cloudfront.net' };
    const appConfig = {
      ...baseAppConfig,
      fileStrategy: FileSources.local,
      fileStrategies: { avatar: FileSources.cloudfront },
      cloudfront: cloudfrontConfig,
    } as AppConfig;
    initializeFileStorage(appConfig);
    expect(initializeCloudFront).toHaveBeenCalledTimes(1);
    expect(initializeCloudFront).toHaveBeenCalledWith(cloudfrontConfig);
    expect(initializeS3).not.toHaveBeenCalled();
  });

  it('does not call any initializer when fileStrategy is local with no fileStrategies', () => {
    const appConfig = { ...baseAppConfig, fileStrategy: FileSources.local } as AppConfig;
    initializeFileStorage(appConfig);
    expect(initializeS3).not.toHaveBeenCalled();
    expect(initializeFirebase).not.toHaveBeenCalled();
    expect(initializeAzureBlobService).not.toHaveBeenCalled();
    expect(initializeCloudFront).not.toHaveBeenCalled();
  });
});
