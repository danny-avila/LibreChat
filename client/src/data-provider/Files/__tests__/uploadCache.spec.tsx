import React from 'react';
import { QueryKeys } from 'librechat-data-provider';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Agent, TFile, TFileUpload } from 'librechat-data-provider';

const mockUploadFile = jest.fn();

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: {
      ...actual.dataService,
      uploadFile: (...args: unknown[]) => mockUploadFile(...args),
    },
  };
});

jest.mock('../../Endpoints', () => ({
  useGetStartupConfig: () => ({ data: { fileUploadSseEnabled: false } }),
}));

jest.mock('@librechat/client', () => ({
  useToastContext: () => ({ showToast: jest.fn() }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

import { useUploadFileMutation } from '../mutations';

const AGENT_ID = 'agent-1';
const EXISTING: TFile = {
  file_id: 'existing-file',
  user: 'user-1',
  bytes: 10,
  embedded: true,
  filename: 'report.pdf',
  filepath: '/uploads/report.pdf',
  object: 'file',
  type: 'application/pdf',
  usage: 0,
};

const uploadBody = (): FormData => {
  const body = new FormData();
  body.append('agent_id', AGENT_ID);
  body.append('tool_resource', 'file_search');
  return body;
};

const setup = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useUploadFileMutation(), { wrapper });
  return { queryClient, result };
};

describe('useUploadFileMutation cache updates', () => {
  beforeEach(() => {
    mockUploadFile.mockReset();
  });

  it('adds a newly uploaded file to the files list and the agent resource', async () => {
    const { queryClient, result } = setup();
    queryClient.setQueryData([QueryKeys.files], [EXISTING]);
    queryClient.setQueryData([QueryKeys.agent, AGENT_ID], {
      id: AGENT_ID,
      tool_resources: { file_search: { file_ids: ['existing-file'] } },
    } as unknown as Agent);

    const uploaded = { ...EXISTING, file_id: 'new-file' } as TFileUpload;
    mockUploadFile.mockResolvedValue(uploaded);

    act(() => {
      result.current.mutate(uploadBody());
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(
      queryClient.getQueryData<TFile[]>([QueryKeys.files])?.map((file) => file.file_id),
    ).toEqual(['new-file', 'existing-file']);
    expect(
      queryClient.getQueryData<Agent>([QueryKeys.agent, AGENT_ID])?.tool_resources?.file_search
        ?.file_ids,
    ).toEqual(['existing-file', 'new-file']);
  });

  /* An upload of content the agent already holds answers with that record,
   * so the cache must reconcile rather than stack a second copy. */
  it('does not duplicate a file the response already refers to', async () => {
    const { queryClient, result } = setup();
    queryClient.setQueryData([QueryKeys.files], [EXISTING]);
    queryClient.setQueryData([QueryKeys.agent, AGENT_ID], {
      id: AGENT_ID,
      tool_resources: { file_search: { file_ids: ['existing-file'] } },
    } as unknown as Agent);

    mockUploadFile.mockResolvedValue({ ...EXISTING, filename: 'renamed.pdf' } as TFileUpload);

    act(() => {
      result.current.mutate(uploadBody());
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const files = queryClient.getQueryData<TFile[]>([QueryKeys.files]);
    expect(files).toHaveLength(1);
    expect(files?.[0].filename).toBe('renamed.pdf');
    expect(
      queryClient.getQueryData<Agent>([QueryKeys.agent, AGENT_ID])?.tool_resources?.file_search
        ?.file_ids,
    ).toEqual(['existing-file']);
  });

  /* `GET /files` only returns the requesting user's files, so a record a
   * collaborator owns would linger in this list until a manual refresh. */
  it('keeps a collaborator-owned record out of the uploader file list', async () => {
    const { queryClient, result } = setup();
    queryClient.setQueryData([QueryKeys.user], { id: 'user-1' });
    queryClient.setQueryData([QueryKeys.files], [EXISTING]);
    queryClient.setQueryData([QueryKeys.agent, AGENT_ID], {
      id: AGENT_ID,
      tool_resources: { file_search: { file_ids: [] } },
    } as unknown as Agent);

    mockUploadFile.mockResolvedValue({
      ...EXISTING,
      file_id: 'other-editors-file',
      user: 'a-different-editor',
    } as TFileUpload);

    act(() => {
      result.current.mutate(uploadBody());
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(
      queryClient.getQueryData<TFile[]>([QueryKeys.files])?.map((file) => file.file_id),
    ).toEqual(['existing-file']);
    /* It is genuinely in the agent's resources, so that half still applies. */
    expect(
      queryClient.getQueryData<Agent>([QueryKeys.agent, AGENT_ID])?.tool_resources?.file_search
        ?.file_ids,
    ).toEqual(['other-editors-file']);
  });

  it('still lists the uploader own files when the user is cached', async () => {
    const { queryClient, result } = setup();
    queryClient.setQueryData([QueryKeys.user], { id: 'user-1' });
    queryClient.setQueryData([QueryKeys.files], []);

    mockUploadFile.mockResolvedValue({ ...EXISTING, file_id: 'mine' } as TFileUpload);

    act(() => {
      result.current.mutate(uploadBody());
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(
      queryClient.getQueryData<TFile[]>([QueryKeys.files])?.map((file) => file.file_id),
    ).toEqual(['mine']);
  });

  it('leaves the cached agent untouched rather than mutating its resource array', async () => {
    const { queryClient, result } = setup();
    const fileIds = ['existing-file'];
    queryClient.setQueryData([QueryKeys.agent, AGENT_ID], {
      id: AGENT_ID,
      tool_resources: { file_search: { file_ids: fileIds } },
    } as unknown as Agent);

    mockUploadFile.mockResolvedValue({ ...EXISTING, file_id: 'new-file' } as TFileUpload);

    act(() => {
      result.current.mutate(uploadBody());
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fileIds).toEqual(['existing-file']);
  });
});
