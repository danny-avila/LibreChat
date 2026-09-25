import React from 'react';
import axios from 'axios';
import { QueryKeys } from 'librechat-data-provider';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { TSkill } from 'librechat-data-provider';
import type { AxiosResponse } from 'axios';
import SkillFileViewer from '../SkillFileViewer';

const mockShowToast = jest.fn();
let mockCanEdit = true;

jest.mock('~/data-provider', () => ({
  useGetSkillFileContentQuery: jest.requireActual('~/data-provider/Skills/queries')
    .useGetSkillFileContentQuery,
  useUploadSkillFileMutation: jest.requireActual('~/data-provider/Skills/mutations')
    .useUploadSkillFileMutation,
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: Record<number, string>) =>
    key === 'com_ui_edited_file' ? `Edited ${values?.[0]}` : key,
  useSkillPermissions: () => ({ isLoading: false, canEdit: mockCanEdit }),
}));

jest.mock('@librechat/client', () => ({
  Button: ({
    children,
    variant: _variant,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) => (
    <button {...props}>{children}</button>
  ),
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
  Spinner: () => <span data-testid="spinner" />,
  MorphIcon: () => <span />,
  TooltipAnchor: ({ render: content }: { render: React.ReactNode }) => content,
  useToastContext: () => ({ showToast: mockShowToast }),
}));

jest.mock('../SkillMarkdownRenderer', () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <pre>{content}</pre>,
}));

jest.mock('../ViewToggle', () => ({
  __esModule: true,
  default: () => <span />,
}));

const skill = { _id: 'skill-id', name: 'example', author: 'user-id' } as TSkill;
const filePath = 'references/queries.md';

function Location() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

function renderViewer(path = filePath) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/skills/skill-id']}>
        <SkillFileViewer skill={skill} skillId={skill._id} relativePath={path} />
        <Location />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

describe('skill file editing', () => {
  beforeEach(() => {
    mockCanEdit = true;
    mockShowToast.mockClear();
  });

  it('round-trips a nested text file via the existing read and multipart replacement endpoints', async () => {
    let persisted = 'original text';
    const get = jest.spyOn(axios, 'get').mockImplementation(async (url) => {
      expect(url).toBe(`/api/skills/skill-id/files/${encodeURIComponent(filePath)}`);
      return {
        data: {
          content: persisted,
          filename: 'queries.md',
          relativePath: filePath,
          mimeType: 'text/markdown',
          isBinary: false,
          bytes: persisted.length,
        },
      } as AxiosResponse;
    });
    const post = jest.spyOn(axios, 'post').mockImplementation(async (url, body) => {
      expect(url).toBe('/api/skills/skill-id/files');
      expect(body).toBeInstanceOf(FormData);
      const formData = body as FormData;
      expect(formData.get('relativePath')).toBe(filePath);
      const file = formData.get('file');
      expect(file).toBeInstanceOf(File);
      if (!(file instanceof File)) {
        throw new Error('Expected an uploaded file');
      }
      expect(file.name).toBe('queries.md');
      expect(file.type).toBe('text/markdown');
      persisted = await readFile(file);
      return {
        data: { relativePath: filePath, filename: file.name, mimeType: file.type },
      } as AxiosResponse;
    });
    const first = renderViewer();

    await screen.findByText('original text');
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_edit' }));
    const textarea = screen.getByRole('textbox', { name: 'com_ui_edit queries.md' });
    expect(textarea).toHaveValue('original text');
    fireEvent.change(textarea, { target: { value: 'persisted text' } });
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_save' }));

    await waitFor(() => expect(persisted).toBe('persisted text'));
    await screen.findByText('persisted text');
    expect(mockShowToast).toHaveBeenCalledWith({ status: 'success', message: 'Edited queries.md' });
    first.unmount();
    first.queryClient.clear();

    const readsBeforeReload = get.mock.calls.length;
    const second = renderViewer();
    await screen.findByText('persisted text');
    expect(get).toHaveBeenCalledTimes(readsBeforeReload + 1);
    expect(post).toHaveBeenCalledTimes(1);
    second.queryClient.clear();
  });

  it('keeps the draft and shows an error when upload fails, then allows retry and cancel', async () => {
    let persisted = 'before';
    jest.spyOn(axios, 'get').mockImplementation(
      async () =>
        ({
          data: {
            content: persisted,
            filename: 'queries.md',
            relativePath: filePath,
            mimeType: 'text/markdown',
            isBinary: false,
            bytes: persisted.length,
          },
        }) as AxiosResponse,
    );
    const post = jest
      .spyOn(axios, 'post')
      .mockRejectedValueOnce(new Error('connection lost'))
      .mockImplementationOnce(async (_url, body) => {
        const file = (body as FormData).get('file');
        if (!(file instanceof File)) {
          throw new Error('Expected an uploaded file');
        }
        persisted = await readFile(file);
        return {
          data: { relativePath: filePath, filename: file.name, mimeType: file.type },
        } as AxiosResponse;
      });
    const view = renderViewer();
    await screen.findByText('before');
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_edit' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'after' } });
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('com_ui_skill_file_save_error');
    expect(screen.getByRole('textbox')).toHaveValue('after');
    expect(screen.getByRole('button', { name: 'com_ui_save' })).toBeEnabled();
    expect(persisted).toBe('before');
    expect(mockShowToast).toHaveBeenCalledWith({
      status: 'error',
      message: 'com_ui_skill_file_save_error',
    });

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_save' }));
    await waitFor(() => expect(persisted).toBe('after'));
    await screen.findByText('after');
    expect(post).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_edit' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'unsaved' } });
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_cancel' }));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(persisted).toBe('after');
    expect(post).toHaveBeenCalledTimes(2);
    view.queryClient.clear();
  });

  it.each([
    ['read-only permissions', false, 'text/markdown', false, 'visible'],
    ['binary content', true, 'image/png', true, undefined],
    ['oversized text without JSON content', true, 'text/plain', false, undefined],
  ])('hides editing for %s', async (_case, allowed, mimeType, isBinary, content) => {
    mockCanEdit = allowed;
    jest.spyOn(axios, 'get').mockResolvedValue({
      data: {
        content,
        filename: 'queries.md',
        relativePath: filePath,
        mimeType,
        isBinary,
        bytes: 12,
      },
    });
    const view = renderViewer();
    await screen.findByText('queries.md');
    await waitFor(() => expect(screen.queryByTestId('spinner')).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'com_ui_edit' })).not.toBeInTheDocument();
    view.queryClient.clear();
  });

  it('can edit an empty text file using the keyboard shortcut', async () => {
    jest.spyOn(axios, 'get').mockResolvedValue({
      data: {
        content: '',
        filename: 'empty.sh',
        relativePath: 'scripts/empty.sh',
        mimeType: 'text/plain',
        isBinary: false,
        bytes: 0,
      },
    });
    const post = jest.spyOn(axios, 'post').mockResolvedValue({
      data: { relativePath: 'scripts/empty.sh', filename: 'empty.sh', mimeType: 'text/plain' },
    });
    const view = renderViewer('scripts/empty.sh');
    fireEvent.click(await screen.findByRole('button', { name: 'com_ui_edit' }));
    const textarea = screen.getByRole('textbox', { name: 'com_ui_edit empty.sh' });
    expect(textarea).toHaveValue('');
    fireEvent.change(textarea, { target: { value: 'echo ready' } });
    fireEvent.keyDown(textarea, { key: 's', ctrlKey: true });
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect((post.mock.calls[0][1] as FormData).get('relativePath')).toBe('scripts/empty.sh');
    view.queryClient.clear();
  });

  it('keeps an in-progress draft but disables Save when edit access is lost', async () => {
    jest.spyOn(axios, 'get').mockResolvedValue({
      data: {
        content: 'old content',
        filename: 'queries.md',
        relativePath: filePath,
        mimeType: 'text/markdown',
        isBinary: false,
        bytes: 11,
      },
    });
    const post = jest.spyOn(axios, 'post');
    const view = renderViewer();
    await screen.findByText('old content');
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_edit' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'unsaved draft' } });
    mockCanEdit = false;
    view.queryClient.setQueryData([QueryKeys.skillFileContent, skill._id, filePath], {
      content: 'remote revision',
      filename: 'queries.md',
      relativePath: filePath,
      mimeType: 'text/markdown',
      isBinary: false,
      bytes: 15,
    });

    await screen.findByRole('note');
    expect(screen.getByRole('textbox')).toHaveValue('unsaved draft');
    expect(screen.getByRole('button', { name: 'com_ui_save' })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 's', ctrlKey: true });
    expect(post).not.toHaveBeenCalled();
    view.queryClient.clear();
  });

  it('does not offer editing when loading a file fails', async () => {
    jest.spyOn(axios, 'get').mockRejectedValue(new Error('file read failed'));
    const view = renderViewer();
    await screen.findByText('com_ui_skill_file_load_error');
    expect(screen.queryByRole('button', { name: 'com_ui_edit' })).not.toBeInTheDocument();
    view.queryClient.clear();
  });

  it('routes SKILL.md edits to the existing skill form, never the multipart file endpoint', async () => {
    jest.spyOn(axios, 'get').mockResolvedValue({
      data: {
        content: '# Skill',
        filename: 'SKILL.md',
        relativePath: 'SKILL.md',
        mimeType: 'text/markdown',
        isBinary: false,
        bytes: 7,
      },
    });
    const post = jest.spyOn(axios, 'post');
    const view = renderViewer('SKILL.md');
    await screen.findByText('# Skill');
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_edit' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/skills/skill-id/edit');
    expect(post).not.toHaveBeenCalled();
    view.queryClient.clear();
  });
});
