import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QueryKeys, MutationKeys, dataService } from 'librechat-data-provider';
import type {
  UserProjectsResponse,
  MemoryDocumentsResponse,
  CreateUserProjectBody,
  UpdateUserProjectBody,
  UpdateMemoryDocumentBody,
} from 'librechat-data-provider';

jest.mock('librechat-data-provider', () => ({
  QueryKeys: {
    userProjects: 'userProjects',
    memoryDocuments: 'memoryDocuments',
    allConversations: 'allConversations',
  },
  MutationKeys: {
    createUserProject: 'createUserProject',
    updateUserProject: 'updateUserProject',
    deleteUserProject: 'deleteUserProject',
    updateMemoryDocument: 'updateMemoryDocument',
    assignConversationProject: 'assignConversationProject',
  },
  dataService: {
    getUserProjects: jest.fn(),
    createUserProject: jest.fn(),
    updateUserProject: jest.fn(),
    deleteUserProject: jest.fn(),
    getMemoryDocuments: jest.fn(),
    updateMemoryDocument: jest.fn(),
    assignConversationProject: jest.fn(),
  },
}));

import {
  useUserProjects,
  useCreateUserProject,
  useUpdateUserProject,
  useDeleteUserProject,
  useMemoryDocuments,
  useUpdateMemoryDocument,
  useAssignConversationProject,
} from '../Projects/queries';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  return { Wrapper, queryClient };
};

const mockDataService = dataService as jest.Mocked<typeof dataService>;

describe('useUserProjects', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call dataService.getUserProjects and use correct query key', async () => {
    const mockResponse: UserProjectsResponse = {
      projects: [
        {
          _id: 'proj-1',
          user: 'user-1',
          name: 'Test Project',
          description: 'A test project',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ],
    };
    mockDataService.getUserProjects.mockResolvedValueOnce(mockResponse);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useUserProjects(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockDataService.getUserProjects).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual(mockResponse);
  });

  it('should handle fetch error', async () => {
    mockDataService.getUserProjects.mockRejectedValueOnce(new Error('Network error'));

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useUserProjects(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeInstanceOf(Error);
  });
});

describe('useCreateUserProject', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call dataService.createUserProject with provided data', async () => {
    const input: CreateUserProjectBody = { name: 'New Project', description: 'desc' };
    const mockProject = {
      _id: 'proj-new',
      user: 'user-1',
      name: 'New Project',
      description: 'desc',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    mockDataService.createUserProject.mockResolvedValueOnce(mockProject);

    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCreateUserProject(), { wrapper: Wrapper });

    result.current.mutate(input);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockDataService.createUserProject).toHaveBeenCalledWith(input);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: [QueryKeys.userProjects],
    });
  });

  it('should handle mutation error', async () => {
    mockDataService.createUserProject.mockRejectedValueOnce(new Error('Create failed'));

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useCreateUserProject(), { wrapper: Wrapper });

    result.current.mutate({ name: 'Failing Project' });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeInstanceOf(Error);
  });
});

describe('useUpdateUserProject', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call dataService.updateUserProject with id and data', async () => {
    const id = 'proj-1';
    const data: UpdateUserProjectBody = { name: 'Updated Name' };
    const mockUpdated = {
      _id: id,
      user: 'user-1',
      name: 'Updated Name',
      description: '',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
    };
    mockDataService.updateUserProject.mockResolvedValueOnce(mockUpdated);

    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useUpdateUserProject(), { wrapper: Wrapper });

    result.current.mutate({ id, data });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockDataService.updateUserProject).toHaveBeenCalledWith(id, data);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: [QueryKeys.userProjects],
    });
  });
});

describe('useDeleteUserProject', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call dataService.deleteUserProject with id', async () => {
    const id = 'proj-1';
    mockDataService.deleteUserProject.mockResolvedValueOnce(undefined);

    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useDeleteUserProject(), { wrapper: Wrapper });

    result.current.mutate(id);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockDataService.deleteUserProject).toHaveBeenCalledWith(id);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: [QueryKeys.userProjects],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: [QueryKeys.memoryDocuments],
    });
  });

  it('should invalidate both userProjects and memoryDocuments queries', async () => {
    mockDataService.deleteUserProject.mockResolvedValueOnce(undefined);

    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useDeleteUserProject(), { wrapper: Wrapper });

    result.current.mutate('proj-2');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const invalidatedKeys = invalidateSpy.mock.calls.map(
      (call) => (call[0] as { queryKey: string[] }).queryKey[0],
    );
    expect(invalidatedKeys).toContain(QueryKeys.userProjects);
    expect(invalidatedKeys).toContain(QueryKeys.memoryDocuments);
  });
});

describe('useMemoryDocuments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call dataService.getMemoryDocuments and use correct query key', async () => {
    const mockResponse: MemoryDocumentsResponse = {
      documents: [
        {
          _id: 'doc-1',
          user: 'user-1',
          scope: 'global',
          content: 'Some memory content',
          tokenCount: 42,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ],
    };
    mockDataService.getMemoryDocuments.mockResolvedValueOnce(mockResponse);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useMemoryDocuments(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockDataService.getMemoryDocuments).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual(mockResponse);
  });

  it('should handle fetch error', async () => {
    mockDataService.getMemoryDocuments.mockRejectedValueOnce(new Error('Fetch failed'));

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useMemoryDocuments(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeInstanceOf(Error);
  });
});

describe('useUpdateMemoryDocument', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call dataService.updateMemoryDocument with scope and data', async () => {
    const scope = 'global';
    const data: UpdateMemoryDocumentBody = { content: 'Updated memory content' };
    mockDataService.updateMemoryDocument.mockResolvedValueOnce({
      _id: 'doc-1',
      user: 'user-1',
      scope,
      content: data.content,
      tokenCount: 50,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
    });

    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useUpdateMemoryDocument(), { wrapper: Wrapper });

    result.current.mutate({ scope, data });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockDataService.updateMemoryDocument).toHaveBeenCalledWith(scope, undefined, data);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: [QueryKeys.memoryDocuments],
    });
  });

  it('should pass projectId when provided', async () => {
    const scope = 'project';
    const projectId = 'proj-1';
    const data: UpdateMemoryDocumentBody = { content: 'Project memory' };
    mockDataService.updateMemoryDocument.mockResolvedValueOnce({
      _id: 'doc-2',
      user: 'user-1',
      scope,
      projectId,
      content: data.content,
      tokenCount: 30,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
    });

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdateMemoryDocument(), { wrapper: Wrapper });

    result.current.mutate({ scope, projectId, data });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockDataService.updateMemoryDocument).toHaveBeenCalledWith(scope, projectId, data);
  });
});

describe('useAssignConversationProject', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call dataService.assignConversationProject with conversationId and projectId', async () => {
    mockDataService.assignConversationProject.mockResolvedValueOnce({ updated: true });

    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useAssignConversationProject(), { wrapper: Wrapper });

    result.current.mutate({ conversationId: 'conv-1', projectId: 'proj-1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockDataService.assignConversationProject).toHaveBeenCalledWith('conv-1', 'proj-1');
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: [QueryKeys.allConversations],
    });
  });

  it('should handle null projectId for unassigning', async () => {
    mockDataService.assignConversationProject.mockResolvedValueOnce({ updated: true });

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useAssignConversationProject(), { wrapper: Wrapper });

    result.current.mutate({ conversationId: 'conv-1', projectId: null });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockDataService.assignConversationProject).toHaveBeenCalledWith('conv-1', null);
  });
});
