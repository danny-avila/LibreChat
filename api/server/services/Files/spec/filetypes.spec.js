const {
  fullMimeTypesList,
  codeInterpreterMimeTypesList,
  retrievalMimeTypesList,
  supportedMimeTypes,
  codeInterpreterMimeTypes,
  retrievalMimeTypes,
} = require('librechat-data-provider');

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
