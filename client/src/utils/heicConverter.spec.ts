describe('heicConverter', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('does not load heic-to for non-HEIC files', async () => {
    jest.doMock(
      'heic-to',
      () => {
        throw new Error('heic-to should not be loaded');
      },
      { virtual: true },
    );

    const { processFileForUpload } = await import('./heicConverter');
    const file = new File(['plain text'], 'notes.txt', { type: 'text/plain' });

    await expect(processFileForUpload(file)).resolves.toBe(file);
  });

  it('detects and converts HEIC files after lazily loading heic-to', async () => {
    const isHeic = jest.fn(async () => true);
    const heicTo = jest.fn(async () => new Blob(['jpeg'], { type: 'image/jpeg' }));
    jest.doMock('heic-to', () => ({ heicTo, isHeic }), { virtual: true });

    const { processFileForUpload } = await import('./heicConverter');
    const file = new File(['heic data'], 'photo.heic', {
      type: 'image/heic',
      lastModified: 123,
    });
    const onProgress = jest.fn();

    const converted = await processFileForUpload(file, 0.85, onProgress);

    expect(isHeic).toHaveBeenCalledWith(file);
    expect(heicTo).toHaveBeenCalledWith({
      blob: file,
      type: 'image/jpeg',
      quality: 0.85,
    });
    expect(converted).not.toBe(file);
    expect(converted.name).toBe('photo.jpg');
    expect(converted.type).toBe('image/jpeg');
    expect(converted.lastModified).toBe(123);
    expect(onProgress.mock.calls.map(([progress]) => progress)).toEqual([0.3, 0.8, 1]);
  });
});
