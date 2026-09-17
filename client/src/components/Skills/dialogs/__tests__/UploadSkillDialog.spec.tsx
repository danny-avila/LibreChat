import { act, fireEvent, render, screen } from '@testing-library/react';
import type { FileConfigInput } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import UploadSkillDialog from '../UploadSkillDialog';

const mockMutate = jest.fn();
const mockNavigate = jest.fn();
const mockSetIsOpen = jest.fn();
const mockShowToast = jest.fn();
interface ImportMutationOptions {
  onSuccess?: (skill: { _id: string }) => void;
  onError?: (error: unknown) => void;
}
let mockImportOptions: ImportMutationOptions | undefined;
let mockFileConfigInput: FileConfigInput | undefined = {
  skills: {
    fileSizeLimit: 1,
  },
};

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('@librechat/client', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const ReactDOM = jest.requireActual<typeof import('react-dom')>('react-dom');
  return {
    OGDialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
      open
        ? ReactDOM.createPortal(
            React.createElement('div', null, children),
            globalThis.document.body,
          )
        : null,
    OGDialogContent: ({ children }: { children: ReactNode }) =>
      React.createElement('div', { role: 'dialog', 'data-state': 'open' }, children),
    Spinner: () => React.createElement('div', { 'data-testid': 'spinner' }),
    useToastContext: () => ({
      showToast: mockShowToast,
    }),
  };
});

jest.mock('~/data-provider', () => ({
  useGetFileConfig: ({ select }: { select?: (data: FileConfigInput | undefined) => unknown }) => ({
    data: select != null ? select(mockFileConfigInput) : mockFileConfigInput,
  }),
  useImportSkillMutation: (options?: ImportMutationOptions) => {
    mockImportOptions = options;
    return {
      mutate: mockMutate,
      isLoading: false,
    };
  },
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
        com_ui_skill_upload_failed_files: 'These files could not be imported:',
        com_ui_skill_upload_incomplete: `Import canceled: ${params?.[0]} file(s) in the archive could not be imported. Fix the archive and upload it again.`,
      };
      return translations[key] ?? key;
    },
}));

jest.mock('~/utils', () => ({
  cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' '),
}));

function getFileInput(container: HTMLElement): HTMLInputElement {
  /** Prefer the local render container used by the lightweight dialog mock,
   *  then the active portal. Exiting Headless UI portals can leave older file
   *  inputs in `document.body`; a document-wide first/last match is unstable. */
  const selector = 'input[type="file"][accept=".zip,.skill,.md"]';
  const input =
    container.querySelector<HTMLInputElement>(selector) ??
    document.querySelector<HTMLInputElement>(`[role="dialog"][data-state="open"] ${selector}`);
  if (input == null) {
    throw new Error('Upload input was not rendered');
  }
  return input;
}

function incompleteImportError(failedFiles: Array<{ path: string; error?: string }>) {
  return {
    response: {
      data: {
        error: 'skill_import_incomplete',
        message: `Import canceled: ${failedFiles.length} of 3 files in the archive could not be imported.`,
        failedFiles,
      },
    },
  };
}

describe('UploadSkillDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockImportOptions = undefined;
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

  it('targets the current upload input when an exiting portal still has one', () => {
    const staleInput = document.createElement('input');
    staleInput.type = 'file';
    staleInput.accept = '.zip,.skill,.md';
    document.body.appendChild(staleInput);

    const { container } = render(<UploadSkillDialog isOpen={true} setIsOpen={mockSetIsOpen} />);

    expect(getFileInput(container)).not.toBe(staleInput);
    staleInput.remove();
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

  it('lists the files a rolled-back import could not persist and keeps the dialog open', () => {
    render(<UploadSkillDialog isOpen={true} setIsOpen={mockSetIsOpen} />);

    act(() => {
      mockImportOptions?.onError?.(
        incompleteImportError([
          { path: 'queries.sql', error: 'File too large (max 10MB)' },
          { path: 'references/region_mapping.md', error: 'Invalid path' },
        ]),
      );
    });

    expect(mockShowToast).toHaveBeenCalledWith({
      status: 'error',
      message:
        'Import canceled: 2 file(s) in the archive could not be imported. Fix the archive and upload it again.',
    });
    expect(screen.getByRole('alert')).toHaveTextContent('These files could not be imported:');
    expect(screen.getByText('queries.sql')).toBeInTheDocument();
    expect(screen.getByText('references/region_mapping.md')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid path');
    expect(mockSetIsOpen).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('clears a previous import failure when a new file is selected', () => {
    const { container } = render(<UploadSkillDialog isOpen={true} setIsOpen={mockSetIsOpen} />);

    act(() => {
      mockImportOptions?.onError?.(incompleteImportError([{ path: 'queries.sql' }]));
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    fireEvent.change(getFileInput(container), {
      target: {
        files: [new File([new Uint8Array(1024)], 'retry.skill', { type: 'application/zip' })],
      },
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mockMutate).toHaveBeenCalledWith(expect.any(FormData));
  });

  it('falls back to the server message for import errors without failed files', () => {
    render(<UploadSkillDialog isOpen={true} setIsOpen={mockSetIsOpen} />);

    act(() => {
      mockImportOptions?.onError?.({
        response: { data: { error: 'Archive must contain a SKILL.md file' } },
      });
    });

    expect(mockShowToast).toHaveBeenCalledWith({
      status: 'error',
      message: 'Archive must contain a SKILL.md file',
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
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
