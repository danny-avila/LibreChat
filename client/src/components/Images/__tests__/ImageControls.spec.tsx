import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { render } from 'test/layout-test-utils';
import type { TImageModel } from 'librechat-data-provider';

const mockUploadImage = jest.fn();
const mockOnImageUrlsChange = jest.fn();

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: {
      ...actual.dataService,
      uploadImage: (...args: unknown[]) => mockUploadImage(...args),
    },
  };
});

jest.mock('~/data-provider', () => ({
  useGetRole: () => ({ data: null }),
  useGetUserQuery: () => ({ data: null }),
  useLoginUserMutation: () => ({ mutate: jest.fn() }),
  useLogoutUserMutation: () => ({ mutate: jest.fn() }),
  useRefreshTokenMutation: () => ({ mutate: jest.fn() }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useAuthContext: () => ({ isAuthenticated: true, user: { id: 'u1' }, roles: {} }),
}));

jest.mock('@librechat/client', () => {
  const actual = jest.requireActual('@librechat/client');
  return {
    ...actual,
    Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectTrigger: ({
      children,
      'aria-label': ariaLabel,
    }: {
      children: React.ReactNode;
      'aria-label'?: string;
    }) => <div aria-label={ariaLabel}>{children}</div>,
    SelectValue: () => null,
    SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});

// jsdom does not load images; resolve onload synchronously so dimensions read resolves
beforeAll(() => {
  Object.defineProperty(global.Image.prototype, 'src', {
    set() {
      setTimeout(() => this.onload?.());
    },
  });
  global.URL.createObjectURL = jest.fn(() => 'blob:mock');
  global.URL.revokeObjectURL = jest.fn();
  // Ensure a spy-able fetch exists so we can assert it is never used
  global.fetch = jest.fn() as unknown as typeof fetch;
});

import ImageControls from '../ImageControls';

const editModel: TImageModel = {
  id: 'flux-edit',
  label: 'Flux Edit',
  supportsEdit: true,
  paramKey: 'resolution',
  paramValues: ['1k', '2k'],
  defaultParam: '1k',
};

const baseProps = {
  selectedModel: editModel,
  aspectRatio: '1:1',
  aspectRatios: ['1:1'],
  param: '1k',
  imageUrls: [] as string[],
  onAspectRatioChange: jest.fn(),
  onParamChange: jest.fn(),
  onImageUrlsChange: mockOnImageUrlsChange,
  onUploadStart: jest.fn(),
  onUploadEnd: jest.fn(),
  isUploading: false,
};

describe('ImageControls reference upload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uploads the reference image via the authenticated dataService, not raw fetch', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    mockUploadImage.mockResolvedValue({ filepath: '/uploads/ref.png', file_id: 'abc' });

    const { container } = render(<ImageControls {...baseProps} />);

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'ref.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(mockUploadImage).toHaveBeenCalledTimes(1);
    });

    // Authenticated path used; raw fetch never called
    expect(fetchSpy).not.toHaveBeenCalled();

    // FormData carries the expected authenticated-upload fields
    const formData = mockUploadImage.mock.calls[0][0] as FormData;
    expect(formData.get('file')).toBeInstanceOf(File);
    expect(formData.get('file_id')).toBeTruthy();
    expect(formData.get('endpoint')).toBe('openAI');

    await waitFor(() => {
      expect(mockOnImageUrlsChange).toHaveBeenCalledWith(['/uploads/ref.png']);
    });

    fetchSpy.mockRestore();
  });

  it('clears the reference url on upload failure (best-effort, no crash)', async () => {
    mockUploadImage.mockRejectedValue(new Error('401'));

    const { container } = render(<ImageControls {...baseProps} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'ref.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(mockOnImageUrlsChange).toHaveBeenCalledWith([]);
    });
  });

  it('uses a capitalized param label for the control', () => {
    render(<ImageControls {...baseProps} />);
    // paramKey 'resolution' -> 'Resolution' (exposed as the control's aria-label)
    expect(screen.getByLabelText('Resolution')).toBeInTheDocument();
  });
});
