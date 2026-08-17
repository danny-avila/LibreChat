import { resolveUploadedImageArguments } from './images';

const first = { file_id: 'first', filepath: '/images/user-1/first.png', type: 'image/png' };
const second = { file_id: 'second', filepath: '/images/user-1/second.jpg', type: 'image/jpeg' };
const third = { file_id: 'third', filepath: '/images/user-1/third.webp', type: 'image/webp' };
const imageUrls = {
  first: 'data:image/png;base64,Zmlyc3Q=',
  second: 'data:image/jpeg;base64,c2Vjb25k',
  third: 'data:image/webp;base64,dGhpcmQ=',
};

function createDependencies(overrides = {}) {
  return {
    findFiles: jest.fn().mockResolvedValue([first, second, third]),
    encodeImages: jest.fn().mockResolvedValue({
      image_urls: [
        { file_id: first.file_id, image_url: { url: imageUrls.first } },
        { file_id: second.file_id, image_url: { url: imageUrls.second } },
        { file_id: third.file_id, image_url: { url: imageUrls.third } },
      ],
    }),
    ...overrides,
  };
}

const request = {
  body: {
    files: [
      { file_id: first.file_id, type: 'image/png' },
      { file_id: second.file_id, type: 'image/jpeg' },
      { file_id: third.file_id, type: 'image/webp' },
    ],
  },
};

describe('resolveUploadedImageArguments', () => {
  it('leaves absent and false opt-ins pass-by-reference without reading files', async () => {
    const dependencies = createDependencies();
    const argumentsToKeep = { customInput: '/mnt/data/0.png' };

    await expect(
      resolveUploadedImageArguments({
        toolArguments: argumentsToKeep,
        request,
        user: { id: 'user-1' },
        dependencies,
      }),
    ).resolves.toBe(argumentsToKeep);
    await expect(
      resolveUploadedImageArguments({
        forwardUploadedImages: false,
        toolArguments: argumentsToKeep,
        request,
        user: { id: 'user-1' },
        dependencies,
      }),
    ).resolves.toBe(argumentsToKeep);

    expect(dependencies.findFiles).not.toHaveBeenCalled();
    expect(dependencies.encodeImages).not.toHaveBeenCalled();
  });

  it('replaces arbitrary nested argument fields, preserves positions, and encodes only referenced files once', async () => {
    const dependencies = createDependencies({
      findFiles: jest.fn().mockResolvedValue([third, second, first]),
    });
    const toolArguments = {
      topLevel: '/mnt/data/2.webp',
      customField: {
        nested: ['/mnt/data/1.jpeg', { source: '/mnt/data/0.png' }, '/mnt/data/1.jpeg'],
      },
      prompt: 'keep the order unchanged',
    };

    await expect(
      resolveUploadedImageArguments({
        forwardUploadedImages: true,
        toolArguments,
        request,
        user: { id: 'user-1' },
        dependencies,
      }),
    ).resolves.toEqual({
      topLevel: imageUrls.third,
      customField: {
        nested: [imageUrls.second, { source: imageUrls.first }, imageUrls.second],
      },
      prompt: 'keep the order unchanged',
    });

    expect(toolArguments).toEqual({
      topLevel: '/mnt/data/2.webp',
      customField: {
        nested: ['/mnt/data/1.jpeg', { source: '/mnt/data/0.png' }, '/mnt/data/1.jpeg'],
      },
      prompt: 'keep the order unchanged',
    });
    expect(dependencies.findFiles).toHaveBeenCalledWith({
      file_id: { $in: [first.file_id, second.file_id, third.file_id] },
      user: 'user-1',
    });
    expect(dependencies.encodeImages).toHaveBeenCalledWith(request, [first, second, third]);
    expect(dependencies.encodeImages).toHaveBeenCalledTimes(1);
  });

  it('queries only referenced current-request image IDs and preserves foreign or sparse placeholders', async () => {
    const owned = { file_id: 'owned', filepath: '/images/user-1/owned.png', type: 'image/png' };
    const dependencies = createDependencies({
      findFiles: jest.fn().mockResolvedValue([owned]),
      encodeImages: jest.fn().mockResolvedValue({
        image_urls: [{ file_id: owned.file_id, image_url: { url: imageUrls.first } }],
      }),
    });
    const isolatedRequest = {
      body: {
        files: [
          { file_id: 'missing-or-foreign', type: 'image/png' },
          { file_id: owned.file_id, type: 'image/png' },
          { file_id: 'not-an-image', type: 'text/plain' },
        ],
      },
    };

    await expect(
      resolveUploadedImageArguments({
        forwardUploadedImages: true,
        toolArguments: { values: ['/mnt/data/0.png', '/mnt/data/1.png', '/mnt/data/2.png'] },
        request: isolatedRequest,
        user: { id: 'effective-user' },
        dependencies,
      }),
    ).resolves.toEqual({
      values: ['/mnt/data/0.png', imageUrls.first, '/mnt/data/2.png'],
    });

    expect(dependencies.findFiles).toHaveBeenCalledWith({
      file_id: { $in: ['missing-or-foreign', owned.file_id] },
      user: 'effective-user',
    });
    expect(dependencies.encodeImages).toHaveBeenCalledWith(isolatedRequest, [owned]);
  });

  it('does not look up hostile, generated, URL, existing data, invalid, or out-of-range values', async () => {
    const dependencies = createDependencies();
    const toolArguments = {
      values: [
        '/app/storage/generated.png',
        'file:///mnt/data/0.png',
        'https://example.com/0.png',
        'data:image/png;base64,Zmlyc3Q=',
        'prefix /mnt/data/0.png',
        '/mnt/data/0.png suffix',
        '/mnt/data/-1.png',
        '/mnt/data/1.5.png',
        '/mnt/data/9007199254740992.png',
        '/mnt/data/0.gif',
        '/mnt/data/0.svg',
        '/mnt/data/0.PNG',
        '/mnt/data/9.png',
      ],
    };

    await expect(
      resolveUploadedImageArguments({
        forwardUploadedImages: true,
        toolArguments,
        request,
        user: { id: 'user-1' },
        dependencies,
      }),
    ).resolves.toBe(toolArguments);

    expect(dependencies.findFiles).not.toHaveBeenCalled();
    expect(dependencies.encodeImages).not.toHaveBeenCalled();
  });

  it('preserves placeholders without a data URL and surfaces encoder failures without logging payloads', async () => {
    const nonDataDependencies = createDependencies({
      encodeImages: jest.fn().mockResolvedValue({
        image_urls: [
          { file_id: first.file_id, image_url: { url: 'https://storage.example/first.png' } },
        ],
      }),
    });
    const toolArguments = { source: '/mnt/data/0.png' };

    await expect(
      resolveUploadedImageArguments({
        forwardUploadedImages: true,
        toolArguments,
        request,
        user: { id: 'user-1' },
        dependencies: nonDataDependencies,
      }),
    ).resolves.toBe(toolArguments);

    const failingDependencies = createDependencies({
      encodeImages: jest.fn().mockRejectedValue(new Error('encoder unavailable')),
    });
    await expect(
      resolveUploadedImageArguments({
        forwardUploadedImages: true,
        toolArguments,
        request,
        user: { id: 'user-1' },
        dependencies: failingDependencies,
      }),
    ).rejects.toThrow('encoder unavailable');
  });

  it.each([
    ['/mnt/data/0.png', 'image/png', 'image/png', imageUrls.first, imageUrls.first],
    ['/mnt/data/0.jpg', 'image/jpg', 'image/jpeg', imageUrls.second, imageUrls.second],
    ['/mnt/data/0.webp', 'image/webp', 'image/webp', imageUrls.third, imageUrls.third],
    [
      '/mnt/data/0.png',
      'image/png',
      'image/png',
      'data:image/svg+xml;base64,c3Zn',
      '/mnt/data/0.png',
    ],
    ['/mnt/data/0.png', 'image/png', 'image/png', 'data:image/gif;base64,Z2lm', '/mnt/data/0.png'],
    ['/mnt/data/0.png', 'image/jpeg', 'image/png', imageUrls.first, '/mnt/data/0.png'],
    ['/mnt/data/0.png', 'image/png', 'image/jpeg', imageUrls.first, '/mnt/data/0.png'],
    ['/mnt/data/0.png', 'image/png', 'image/png', imageUrls.second, '/mnt/data/0.png'],
    ['/mnt/data/0.png', 'image/png', 'image/png', imageUrls.third, '/mnt/data/0.png'],
    ['/mnt/data/0.png', 'image/png', 'image/png', 'data:image/png;base64,', '/mnt/data/0.png'],
    [
      '/mnt/data/0.png',
      'image/png',
      'image/png',
      'data:image/png;base64,not-base64!',
      '/mnt/data/0.png',
    ],
  ])(
    'replaces only matching supported MIME image data for %s',
    async (placeholder, requestType, fileType, encodedUrl, expected) => {
      const file = { file_id: 'image', type: fileType };
      const dependencies = createDependencies({
        findFiles: jest.fn().mockResolvedValue([file]),
        encodeImages: jest.fn().mockResolvedValue({
          image_urls: [{ file_id: file.file_id, image_url: { url: encodedUrl } }],
        }),
      });
      const currentRequest = { body: { files: [{ file_id: file.file_id, type: requestType }] } };

      await expect(
        resolveUploadedImageArguments({
          forwardUploadedImages: true,
          toolArguments: { source: placeholder },
          request: currentRequest,
          user: { id: 'user-1' },
          dependencies,
        }),
      ).resolves.toEqual({ source: expected });
    },
  );
});
