import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FileSources } from 'librechat-data-provider';
import type { ExtendedFile } from '~/common';
import FileRow from '../FileRow';

jest.mock('~/hooks', () => ({
  useLocalize: jest.fn(),
}));

jest.mock('~/data-provider', () => ({
  useDeleteFilesMutation: jest.fn(),
}));

jest.mock('~/hooks/Files', () => ({
  useFileDeletion: jest.fn(),
}));

jest.mock('~/utils', () => ({
  logger: {
    log: jest.fn(),
  },
}));

jest.mock('../Image', () => {
  return function MockImage({ url, progress, source }: any) {
    return (
      <div data-testid="mock-image">
        <span data-testid="image-url">{url}</span>
        <span data-testid="image-progress">{progress}</span>
        <span data-testid="image-source">{source}</span>
      </div>
    );
  };
});

jest.mock('../FileContainer', () => {
  return function MockFileContainer({ file }: any) {
    return (
      <div data-testid="mock-file-container">
        <span data-testid="file-name">{file.filename}</span>
      </div>
    );
  };
});

const mockUseLocalize = jest.requireMock('~/hooks').useLocalize;
const mockUseDeleteFilesMutation = jest.requireMock('~/data-provider').useDeleteFilesMutation;
const mockUseFileDeletion = jest.requireMock('~/hooks/Files').useFileDeletion;

describe('FileRow', () => {
  const mockSetFiles = jest.fn();
  const mockSetFilesLoading = jest.fn();
  const mockDeleteFile = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    mockUseLocalize.mockReturnValue((key: string) => {
      const translations: Record<string, string> = {
        com_ui_deleting_file: 'Deleting file...',
      };
      return translations[key] || key;
    });

    mockUseDeleteFilesMutation.mockReturnValue({
      mutateAsync: jest.fn(),
    });

    mockUseFileDeletion.mockReturnValue({
      deleteFile: mockDeleteFile,
    });
  });

  /**
   * Creates a mock ExtendedFile with sensible defaults
   */
  const createMockFile = (overrides: Partial<ExtendedFile> = {}): ExtendedFile => ({
    file_id: 'test-file-id',
    type: 'image/png',
    preview: 'blob:http://localhost:3080/preview-blob-url',
    filepath: '/images/user123/test-file-id__image.png',
    filename: 'test-image.png',
    progress: 1,
    size: 1024,
    source: FileSources.local,
    ...overrides,
  });

  const renderFileRow = (files: Map<string, ExtendedFile>) => {
    return render(
      <FileRow files={files} setFiles={mockSetFiles} setFilesLoading={mockSetFilesLoading} />,
    );
  };

  describe('Image URL Selection Logic', () => {
    it('should use filepath instead of preview when progress is 1 (upload complete)', () => {
      const file = createMockFile({
        file_id: 'uploaded-file',
        preview: 'blob:http://localhost:3080/temp-preview',
        filepath: '/images/user123/uploaded-file__image.png',
        progress: 1,
      });

      const filesMap = new Map<string, ExtendedFile>();
      filesMap.set(file.file_id, file);

      renderFileRow(filesMap);

      const imageUrl = screen.getByTestId('image-url').textContent;
      expect(imageUrl).toBe('/images/user123/uploaded-file__image.png');
      expect(imageUrl).not.toContain('blob:');
    });

    it('should use preview when progress is less than 1 (uploading)', () => {
      const file = createMockFile({
        file_id: 'uploading-file',
        preview: 'blob:http://localhost:3080/temp-preview',
        filepath: undefined,
        progress: 0.5,
      });

      const filesMap = new Map<string, ExtendedFile>();
      filesMap.set(file.file_id, file);

      renderFileRow(filesMap);

      const imageUrl = screen.getByTestId('image-url').textContent;
      expect(imageUrl).toBe('blob:http://localhost:3080/temp-preview');
    });

    it('should fallback to filepath when preview is undefined and progress is less than 1', () => {
      const file = createMockFile({
        file_id: 'file-without-preview',
        preview: undefined,
        filepath: '/images/user123/file-without-preview__image.png',
        progress: 0.7,
      });

      const filesMap = new Map<string, ExtendedFile>();
      filesMap.set(file.file_id, file);

      renderFileRow(filesMap);

      const imageUrl = screen.getByTestId('image-url').textContent;
      expect(imageUrl).toBe('/images/user123/file-without-preview__image.png');
    });

    it('should use filepath when both preview and filepath exist and progress is exactly 1', () => {
      const file = createMockFile({
        file_id: 'complete-file',
        preview: 'blob:http://localhost:3080/old-blob',
        filepath: '/images/user123/complete-file__image.png',
        progress: 1.0,
      });

      const filesMap = new Map<string, ExtendedFile>();
      filesMap.set(file.file_id, file);

      renderFileRow(filesMap);

      const imageUrl = screen.getByTestId('image-url').textContent;
      expect(imageUrl).toBe('/images/user123/complete-file__image.png');
    });
  });

  describe('Progress States', () => {
    it('should pass correct progress value during upload', () => {
      const file = createMockFile({
        progress: 0.65,
      });

      const filesMap = new Map<string, ExtendedFile>();
      filesMap.set(file.file_id, file);

      renderFileRow(filesMap);

      const progress = screen.getByTestId('image-progress').textContent;
      expect(progress).toBe('0.65');
    });

    it('should pass progress value of 1 when upload is complete', () => {
      const file = createMockFile({
        progress: 1,
      });

      const filesMap = new Map<string, ExtendedFile>();
      filesMap.set(file.file_id, file);

      renderFileRow(filesMap);

      const progress = screen.getByTestId('image-progress').textContent;
      expect(progress).toBe('1');
    });
  });

  describe('File Source', () => {
    it('should pass local source to Image component', () => {
      const file = createMockFile({
        source: FileSources.local,
      });

      const filesMap = new Map<string, ExtendedFile>();
      filesMap.set(file.file_id, file);

      renderFileRow(filesMap);

      const source = screen.getByTestId('image-source').textContent;
      expect(source).toBe(FileSources.local);
    });

    it('should pass openai source to Image component', () => {
      const file = createMockFile({
        source: FileSources.openai,
      });

      const filesMap = new Map<string, ExtendedFile>();
      filesMap.set(file.file_id, file);

      renderFileRow(filesMap);

      const source = screen.getByTestId('image-source').textContent;
      expect(source).toBe(FileSources.openai);
    });
  });

  describe('File Type Detection', () => {
    it('should render Image component for image files', () => {
      const file = createMockFile({
        type: 'image/jpeg',
      });

      const filesMap = new Map<string, ExtendedFile>();
      filesMap.set(file.file_id, file);

      renderFileRow(filesMap);

      expect(screen.getByTestId('mock-image')).toBeInTheDocument();
      expect(screen.queryByTestId('mock-file-container')).not.toBeInTheDocument();
    });

    it('should render FileContainer for non-image files', () => {
      const file = createMockFile({
        type: 'application/pdf',
        filename: 'document.pdf',
      });

      const filesMap = new Map<string, ExtendedFile>();
      filesMap.set(file.file_id, file);

      renderFileRow(filesMap);

      expect(screen.getByTestId('mock-file-container')).toBeInTheDocument();
      expect(screen.queryByTestId('mock-image')).not.toBeInTheDocument();
    });
  });

  describe('Multiple Files', () => {
    it('should render multiple image files with correct URLs based on their progress', () => {
      const filesMap = new Map<string, ExtendedFile>();

      const uploadingFile = createMockFile({
        file_id: 'file-1',
        preview: 'blob:http://localhost:3080/preview-1',
        filepath: undefined,
        progress: 0.3,
      });

      const completedFile = createMockFile({
        file_id: 'file-2',
        preview: 'blob:http://localhost:3080/preview-2',
        filepath: '/images/user123/file-2__image.png',
        progress: 1,
      });

      filesMap.set(uploadingFile.file_id, uploadingFile);
      filesMap.set(completedFile.file_id, completedFile);

      renderFileRow(filesMap);

      const images = screen.getAllByTestId('mock-image');
      expect(images).toHaveLength(2);

      const urls = screen.getAllByTestId('image-url').map((el) => el.textContent);
      expect(urls).toContain('blob:http://localhost:3080/preview-1');
      expect(urls).toContain('/images/user123/file-2__image.png');
    });

    it('should deduplicate files with the same file_id', () => {
      const filesMap = new Map<string, ExtendedFile>();

      const file1 = createMockFile({ file_id: 'duplicate-id' });
      const file2 = createMockFile({ file_id: 'duplicate-id' });

      filesMap.set('key-1', file1);
      filesMap.set('key-2', file2);

      renderFileRow(filesMap);

      const images = screen.getAllByTestId('mock-image');
      expect(images).toHaveLength(1);
    });
  });

  describe('Empty State', () => {
    it('should render nothing when files map is empty', () => {
      const filesMap = new Map<string, ExtendedFile>();

      const { container } = renderFileRow(filesMap);

      expect(container.firstChild).toBeNull();
    });

    it('should render nothing when files is undefined', () => {
      const { container } = render(
        <FileRow files={undefined} setFiles={mockSetFiles} setFilesLoading={mockSetFilesLoading} />,
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe('Regression: Blob URL Bug Fix', () => {
    it('should NOT use revoked blob URL after upload completes', () => {
      const file = createMockFile({
        file_id: 'regression-test',
        preview: 'blob:http://localhost:3080/d25f730c-152d-41f7-8d79-c9fa448f606b',
        filepath:
          '/images/68c98b26901ebe2d87c193a2/c0fe1b93-ba3d-456c-80be-9a492bfd9ed0__image.png',
        progress: 1,
      });

      const filesMap = new Map<string, ExtendedFile>();
      filesMap.set(file.file_id, file);

      renderFileRow(filesMap);

      const imageUrl = screen.getByTestId('image-url').textContent;

      expect(imageUrl).not.toContain('blob:');
      expect(imageUrl).toBe(
        '/images/68c98b26901ebe2d87c193a2/c0fe1b93-ba3d-456c-80be-9a492bfd9ed0__image.png',
      );
    });
  });
});
