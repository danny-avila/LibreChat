import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { FileConfigInput } from 'librechat-data-provider';
import UploadSkillDialog from '../UploadSkillDialog';

const mockMutate = jest.fn();
const mockNavigate = jest.fn();
const mockSetIsOpen = jest.fn();
const mockShowToast = jest.fn();
let mockFileConfigInput: FileConfigInput | undefined = {
  skills: {
    fileSizeLimit: 1,
  },
};

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock(
  '@librechat/client',
  () => {
    const React = jest.requireActual<typeof import('react')>('react');
    return {
      OGDialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
        open ? React.createElement('div', null, children) : null,
      OGDialogContent: ({ children }: { children: ReactNode }) =>
        React.createElement('div', null, children),
      Spinner: () => React.createElement('div', { 'data-testid': 'spinner' }),
      useToastContext: () => ({
        showToast: mockShowToast,
      }),
    };
  },
  { virtual: true },
);

jest.mock('~/data-provider', () => ({
  useGetFileConfig: ({ select }: { select?: (data: FileConfigInput | undefined) => unknown }) => ({
    data: select != null ? select(mockFileConfigInput) : mockFileConfigInput,
  }),
  useImportSkillMutation: () => ({
    mutate: mockMutate,
    isLoading: false,
  }),
}));

jest.mock('~/hooks', () => ({
  useLocalize:
    () =>
    (key: string, params?: Record<string, string | number | undefined>): string => {
      const translations: Record<string, string> = {
        com_ui_skill_upload_title: 'Upload skill',
        com_ui_skill_upload_drag: 'Drag and drop or click to upload',
        com_ui_skill_upload_requirements: 'File requirements',
        com_ui_skill_upload_req_md:
          '.md file must contain skill name and description formatted in YAML',
        com_ui_skill_upload_req_zip: '.zip or .skill file must include a SKILL.md file',
        com_ui_skill_upload_req_size: `File size must not exceed ${params?.[0]} MB`,
        com_ui_skill_upload_size_error: `Skill import must not exceed ${params?.[0]} MB`,
        com_ui_skill_created: 'Skill created',
        com_ui_create_skill_upload_error: 'Failed to read the uploaded file',
      };
      return translations[key] ?? key;
    },
}));

jest.mock('~/utils', () => ({
  cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' '),
}));

function getFileInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('Upload input was not rendered');
  }
  return input;
}

describe('UploadSkillDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFileConfigInput = {
      skills: {
        fileSizeLimit: 1,
      },
    };
  });

  it('renders the configured skill import size limit', () => {
    render(<UploadSkillDialog isOpen={true} setIsOpen={mockSetIsOpen} />);

    expect(screen.getByText('File size must not exceed 1 MB')).toBeInTheDocument();
  });

  it('renders fractional configured skill import size limits exactly', () => {
    mockFileConfigInput = {
      skills: {
        fileSizeLimit: 1.06,
      },
    };

    render(<UploadSkillDialog isOpen={true} setIsOpen={mockSetIsOpen} />);

    expect(screen.getByText('File size must not exceed 1.06 MB')).toBeInTheDocument();
  });

  it('rejects files above the configured skill import limit before upload', () => {
    const { container } = render(<UploadSkillDialog isOpen={true} setIsOpen={mockSetIsOpen} />);
    const file = new File([new Uint8Array(1024 * 1024 + 1)], 'too-large.skill', {
      type: 'application/zip',
    });

    fireEvent.change(getFileInput(container), {
      target: {
        files: [file],
      },
    });

    expect(mockMutate).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith({
      status: 'error',
      message: 'Skill import must not exceed 1 MB',
    });
  });

  it('uploads files exactly at the configured skill import limit', () => {
    const appendSpy = jest.spyOn(FormData.prototype, 'append');
    const { container } = render(<UploadSkillDialog isOpen={true} setIsOpen={mockSetIsOpen} />);
    const file = new File([new Uint8Array(1024 * 1024)], 'exact-limit.skill', {
      type: 'application/zip',
    });

    fireEvent.change(getFileInput(container), {
      target: {
        files: [file],
      },
    });

    expect(mockShowToast).not.toHaveBeenCalled();
    expect(appendSpy).toHaveBeenCalledWith('file', file, file.name);
    expect(mockMutate).toHaveBeenCalledWith(expect.any(FormData));
    appendSpy.mockRestore();
  });

  it('uploads files under the configured skill import limit', () => {
    const appendSpy = jest.spyOn(FormData.prototype, 'append');
    const { container } = render(<UploadSkillDialog isOpen={true} setIsOpen={mockSetIsOpen} />);
    const file = new File([new Uint8Array(1024)], 'small.skill', {
      type: 'application/zip',
    });

    fireEvent.change(getFileInput(container), {
      target: {
        files: [file],
      },
    });

    expect(mockShowToast).not.toHaveBeenCalled();
    expect(appendSpy).toHaveBeenCalledWith('file', file, file.name);
    expect(mockMutate).toHaveBeenCalledWith(expect.any(FormData));
    appendSpy.mockRestore();
  });
});
