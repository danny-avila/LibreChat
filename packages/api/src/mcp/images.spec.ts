import { appendUploadedImageInventory, resolveUploadedImageArguments } from './images';

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
    findFiles: jest.fn().mockResolvedValue([first]),
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

  it('resolves exact nested attachment references from one unambiguous current-request filename', async () => {
    const attachmentFirst = { ...first, filename: 'first.png' };
    const attachmentRequest = {
      body: {
        files: [
          {
            file_id: attachmentFirst.file_id,
            filename: attachmentFirst.filename,
            type: 'image/png',
          },
        ],
      },
    };
    const dependencies = createDependencies({
      findFiles: jest.fn().mockResolvedValue([attachmentFirst]),
      encodeImages: jest.fn().mockResolvedValue({
        image_urls: [{ file_id: attachmentFirst.file_id, image_url: { url: imageUrls.first } }],
      }),
    });

    await expect(
      resolveUploadedImageArguments({
        forwardUploadedImages: true,
        toolArguments: { nested: [{ image: 'attachment:/first.png' }] },
        request: attachmentRequest,
        user: { id: 'user-1' },
        dependencies,
      }),
    ).resolves.toEqual({ nested: [{ image: imageUrls.first }] });

    expect(dependencies.findFiles).toHaveBeenCalledWith({
      file_id: { $in: [attachmentFirst.file_id] },
      user: 'user-1',
    });
  });

  it('resolves a converted attachment alias by its original filename without weakening canonical MIME checks', async () => {
    const convertedFile = { ...first, filename: 'holiday.jpeg', type: 'image/png' };
    const convertedRequest = {
      body: {
        files: [
          {
            file_id: convertedFile.file_id,
            filename: convertedFile.filename,
            type: convertedFile.type,
          },
        ],
      },
    };
    const dependencies = createDependencies({
      findFiles: jest.fn().mockResolvedValue([convertedFile]),
      encodeImages: jest.fn().mockResolvedValue({
        image_urls: [{ file_id: convertedFile.file_id, image_url: { url: imageUrls.first } }],
      }),
    });

    await expect(
      resolveUploadedImageArguments({
        forwardUploadedImages: true,
        toolArguments: { image: 'attachment:/holiday.jpeg' },
        request: convertedRequest,
        user: { id: 'user-1' },
        dependencies,
      }),
    ).resolves.toEqual({ image: imageUrls.first });

    await expect(
      resolveUploadedImageArguments({
        forwardUploadedImages: true,
        toolArguments: { image: '/mnt/data/0.jpeg' },
        request: convertedRequest,
        user: { id: 'user-1' },
        dependencies,
      }),
    ).rejects.toThrow('Unable to resolve referenced uploaded image.');
  });

  it('adds a deterministic payload-free canonical inventory to the current model message once', () => {
    const formattedMessage = { role: 'user', content: 'Remove the background.' };
    const updated = appendUploadedImageInventory({
      formattedMessage,
      request: {
        body: {
          files: [
            { file_id: 'holiday', filename: 'holiday.jpeg' },
            { file_id: 'notes', filename: 'notes.txt' },
            { file_id: 'second', filename: 'another.png' },
          ],
        },
      },
      files: [
        {
          file_id: 'holiday',
          filename: 'holiday.jpeg',
          type: 'image/png',
          filepath: '/uploads/user/holiday.png',
        },
        { file_id: 'notes', filename: 'notes.txt', type: 'text/plain' },
        { file_id: 'second', filename: 'another.png', type: 'image/webp' },
      ],
    });

    expect(updated).toBe(true);
    expect(formattedMessage.content).toContain('/mnt/data/0.png');
    expect(formattedMessage.content).toContain('/mnt/data/2.webp');
    expect(formattedMessage.content).toContain('holiday.jpeg');
    expect(formattedMessage.content).not.toContain('data:');
    expect(formattedMessage.content).not.toContain('base64');
    expect(formattedMessage.content).not.toContain('/uploads/user/holiday.png');
    expect(
      appendUploadedImageInventory({
        formattedMessage,
        request: { body: { files: [] } },
        files: [],
      }),
    ).toBe(false);
    expect(formattedMessage.content.match(/\/mnt\/data\/0\.png/g)).toHaveLength(1);
  });

  it('does not let user text suppress the current uploaded-image inventory', () => {
    const formattedMessage = {
      role: 'user',
      content: 'Current uploaded images for MCP tools are ready.',
    };
    const inventoryParams = {
      formattedMessage,
      request: {
        body: { files: [{ file_id: 'holiday', filename: 'holiday.jpeg' }] },
      },
      files: [{ file_id: 'holiday', filename: 'holiday.jpeg', type: 'image/png' }],
    };

    expect(appendUploadedImageInventory(inventoryParams)).toBe(true);
    expect(formattedMessage.content).toContain('/mnt/data/0.png');
    expect(appendUploadedImageInventory(inventoryParams)).toBe(false);
    expect(formattedMessage.content.match(/\/mnt\/data\/0\.png/g)).toHaveLength(1);
  });

  it('fails closed without reading files for duplicate current-request attachment filenames', async () => {
    const dependencies = createDependencies();
    const duplicateRequest = {
      body: {
        files: [
          { file_id: 'first-id', filename: 'duplicate.png', type: 'image/png' },
          { file_id: 'second-id', filename: 'duplicate.png', type: 'image/png' },
        ],
      },
    };

    await expect(
      resolveUploadedImageArguments({
        forwardUploadedImages: true,
        toolArguments: { image: 'attachment:/duplicate.png' },
        request: duplicateRequest,
        user: { id: 'user-1' },
        dependencies,
      }),
    ).rejects.toThrow('Unable to resolve referenced uploaded image.');

    expect(dependencies.findFiles).not.toHaveBeenCalled();
    expect(dependencies.encodeImages).not.toHaveBeenCalled();
  });

  it('fails closed for malformed attachment references without reading files', async () => {
    const dependencies = createDependencies();

    await expect(
      resolveUploadedImageArguments({
        forwardUploadedImages: true,
        toolArguments: { image: 'attachment:/../../private.png' },
        request,
        user: { id: 'user-1' },
        dependencies,
      }),
    ).rejects.toThrow('Unable to resolve referenced uploaded image.');

    expect(dependencies.findFiles).not.toHaveBeenCalled();
    expect(dependencies.encodeImages).not.toHaveBeenCalled();
  });

  it.each([[['/mnt/data/0.jpg', '/mnt/data/0.png']], [['/mnt/data/0.png', '/mnt/data/0.jpg']]])(
    'fails closed for conflicting extensions at the same request index: %p',
    async (values) => {
      const dependencies = createDependencies({
        findFiles: jest.fn().mockResolvedValue([first]),
        encodeImages: jest.fn().mockResolvedValue({
          image_urls: [{ file_id: first.file_id, image_url: { url: imageUrls.first } }],
        }),
      });

      await expect(
        resolveUploadedImageArguments({
          forwardUploadedImages: true,
          toolArguments: { values },
          request,
          user: { id: 'user-1' },
          dependencies,
        }),
      ).rejects.toThrow('Unable to resolve referenced uploaded image.');
    },
  );

  it('fails closed for foreign or sparse current-request upload placeholders', async () => {
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
    ).rejects.toThrow('Unable to resolve referenced uploaded image.');

    expect(dependencies.findFiles).not.toHaveBeenCalled();
    expect(dependencies.encodeImages).not.toHaveBeenCalled();
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

  it('fails closed for an unresolved data URL and a failed encoder', async () => {
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
    ).rejects.toThrow('Unable to resolve referenced uploaded image.');

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
    ).rejects.toThrow('Unable to resolve referenced uploaded image.');
  });

  it('replaces encoder failures with a bounded error that excludes a data URL payload', async () => {
    const payload = 'data:image/png;base64,cHJpdmF0ZS1pbWFnZS1ieXRlcw==';
    const dependencies = createDependencies({
      encodeImages: jest.fn().mockRejectedValue(new Error(`encoder unavailable: ${payload}`)),
    });

    const resolution = resolveUploadedImageArguments({
      forwardUploadedImages: true,
      toolArguments: { source: '/mnt/data/0.png' },
      request,
      user: { id: 'user-1' },
      dependencies,
    });

    await expect(resolution).rejects.toThrow('Unable to resolve referenced uploaded image.');
    await resolution.catch((error) => expect(error.message).not.toContain(payload));
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
    [
      '/mnt/data/0.png',
      'image/png',
      'image/png',
      'data:image/png;base64,Zg==',
      'data:image/png;base64,Zg==',
    ],
    ['/mnt/data/0.png', 'image/png', 'image/png', 'data:image/png;base64,Zh==', '/mnt/data/0.png'],
    [
      '/mnt/data/0.png',
      'image/png',
      'image/png',
      'data:image/png;base64,Zm8=',
      'data:image/png;base64,Zm8=',
    ],
    ['/mnt/data/0.png', 'image/png', 'image/png', 'data:image/png;base64,Zm9=', '/mnt/data/0.png'],
    [
      '/mnt/data/0.png',
      'image/png',
      'image/png',
      'data:image/png;base64,Zg==\n',
      '/mnt/data/0.png',
    ],
    ['/mnt/data/0.png', 'image/png', 'image/png', 'data:image/png;base64,Zg--', '/mnt/data/0.png'],
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

      const resolution = resolveUploadedImageArguments({
        forwardUploadedImages: true,
        toolArguments: { source: placeholder },
        request: currentRequest,
        user: { id: 'user-1' },
        dependencies,
      });
      if (expected === placeholder) {
        await expect(resolution).rejects.toThrow('Unable to resolve referenced uploaded image.');
      } else {
        await expect(resolution).resolves.toEqual({ source: expected });
      }
    },
  );
});
