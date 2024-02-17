import {
  fileConfig,
  fullMimeTypesList,
  codeInterpreterMimeTypesList,
  retrievalMimeTypesList,
  supportedMimeTypes,
  codeInterpreterMimeTypes,
  retrievalMimeTypes,
  excelFileTypes,
  excelMimeTypes,
  fileConfigSchema,
  mergeFileConfig,
  mbToBytes,
} from '../src/file-config';

describe('MIME Type Regex Patterns', () => {
  const unsupportedMimeTypes = [
    'text/x-unknown',
    'application/unknown',
    'image/bmp',
    'image/svg',
    'audio/mp3',
  ];

  // Testing general supported MIME types
  fullMimeTypesList.forEach((mimeType) => {
    test(`"${mimeType}" should match one of the supported regex patterns in supportedMimeTypes`, () => {
      const matches = supportedMimeTypes.some((regex) => regex.test(mimeType));
      expect(matches).toBeTruthy();
    });
  });

  // Testing unsupported MIME types
  unsupportedMimeTypes.forEach((mimeType) => {
    test(`"${mimeType}" should not match any of the supported regex patterns in supportedMimeTypes`, () => {
      const matches = supportedMimeTypes.some((regex) => regex.test(mimeType));
      expect(matches).toBeFalsy();
    });
  });

  // Testing MIME types for Code Interpreter support
  codeInterpreterMimeTypesList.forEach((mimeType) => {
    test(`"${mimeType}" should be supported by codeInterpreterMimeTypes`, () => {
      const matches = codeInterpreterMimeTypes.some((regex) => regex.test(mimeType));
      expect(matches).toBeTruthy();
    });
  });

  // Testing MIME types for Retrieval support
  retrievalMimeTypesList.forEach((mimeType) => {
    test(`"${mimeType}" should be supported by retrievalMimeTypes`, () => {
      const matches = retrievalMimeTypes.some((regex) => regex.test(mimeType));
      expect(matches).toBeTruthy();
    });
  });
});

describe('MIME Types Exclusive to Code Interpreter', () => {
  const exclusiveCodeInterpreterMimeTypes = codeInterpreterMimeTypesList.filter(
    (mimeType) => !retrievalMimeTypesList.includes(mimeType),
  );

  exclusiveCodeInterpreterMimeTypes.forEach((mimeType) => {
    test(`"${mimeType}" should not be supported by retrievalMimeTypes`, () => {
      const isSupportedByRetrieval = retrievalMimeTypes.some((regex) => regex.test(mimeType));
      expect(isSupportedByRetrieval).toBeFalsy();
    });
  });
});

describe('Testing Excel MIME types', () => {
  excelFileTypes.forEach((mimeType) => {
    test(`"${mimeType}" should match one of the supported regex patterns in supportedMimeTypes`, () => {
      const matches = supportedMimeTypes.some((regex) => regex.test(mimeType));
      expect(matches).toBeTruthy();
    });
  });

  test('Excel MIME types should match the regex pattern in excelMimeTypes', () => {
    const matches = excelFileTypes.every((mimeType) => excelMimeTypes.test(mimeType));
    expect(matches).toBeTruthy();
  });
});

describe('Testing `fileConfig`', () => {
  describe('checkType function', () => {
    test('should return true for supported MIME types', () => {
      const fileTypes = ['text/csv', 'application/json', 'application/pdf', 'image/jpeg'];
      fileTypes.forEach((fileType) => {
        const isSupported = fileConfig.checkType(fileType);
        expect(isSupported).toBe(true);
      });
    });

    test('should return false for unsupported MIME types', () => {
      const fileTypes = ['text/mamba', 'application/exe', 'no-image', ''];
      fileTypes.forEach((fileType) => {
        const isSupported = fileConfig.checkType(fileType);
        expect(isSupported).toBe(false);
      });
    });
  });
});

const dynamicConfigs = {
  minimalUpdate: {
    serverFileSizeLimit: 1024, // Increasing server file size limit
  },
  fullOverrideDefaultEndpoint: {
    endpoints: {
      default: {
        fileLimit: 15,
        fileSizeLimit: 30,
        totalSizeLimit: 60,
        supportedMimeTypes: ['^video/.*$'], // Changing to support video files
      },
    },
  },
  newEndpointAddition: {
    endpoints: {
      newEndpoint: {
        fileLimit: 5,
        fileSizeLimit: 10,
        totalSizeLimit: 20,
        supportedMimeTypes: ['^application/json$', '^application/xml$'],
      },
    },
  },
};

describe('mergeFileConfig', () => {
  test('merges minimal update correctly', () => {
    const result = mergeFileConfig(dynamicConfigs.minimalUpdate);
    expect(result.serverFileSizeLimit).toEqual(mbToBytes(1024));
    const parsedResult = fileConfigSchema.safeParse(result);
    expect(parsedResult.success).toBeTruthy();
  });

  test('overrides default endpoint with full new configuration', () => {
    const result = mergeFileConfig(dynamicConfigs.fullOverrideDefaultEndpoint);
    expect(result.endpoints.default.fileLimit).toEqual(15);
    expect(result.endpoints.default.supportedMimeTypes).toEqual(
      expect.arrayContaining([new RegExp('^video/.*$')]),
    );
    const parsedResult = fileConfigSchema.safeParse(result);
    expect(parsedResult.success).toBeTruthy();
  });

  test('adds new endpoint configuration correctly', () => {
    const result = mergeFileConfig(dynamicConfigs.newEndpointAddition);
    expect(result.endpoints.newEndpoint).toBeDefined();
    expect(result.endpoints.newEndpoint.fileLimit).toEqual(5);
    expect(result.endpoints.newEndpoint.supportedMimeTypes).toEqual(
      expect.arrayContaining([new RegExp('^application/json$')]),
    );
    const parsedResult = fileConfigSchema.safeParse(result);
    expect(parsedResult.success).toBeTruthy();
  });

  test('disables an endpoint and sets numeric fields to 0 and empties supportedMimeTypes', () => {
    const configWithDisabledEndpoint = {
      endpoints: {
        disabledEndpoint: {
          disabled: true,
          fileLimit: 15,
          fileSizeLimit: 30,
          totalSizeLimit: 60,
          supportedMimeTypes: ['^video/.*$'],
        },
      },
    };

    const result = mergeFileConfig(configWithDisabledEndpoint);
    expect(result.endpoints.disabledEndpoint).toBeDefined();
    expect(result.endpoints.disabledEndpoint.disabled).toEqual(true);
    expect(result.endpoints.disabledEndpoint.fileLimit).toEqual(0);
    expect(result.endpoints.disabledEndpoint.fileSizeLimit).toEqual(0);
    expect(result.endpoints.disabledEndpoint.totalSizeLimit).toEqual(0);
    expect(result.endpoints.disabledEndpoint.supportedMimeTypes).toEqual([]);
  });
});
