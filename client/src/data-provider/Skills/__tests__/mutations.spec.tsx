import React from 'react';
import { QueryKeys } from 'librechat-data-provider';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TSkill, TSkillListResponse } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import { useCreateSkillMutation } from '../mutations';
import { useSkillsInfiniteQuery } from '../queries';

const mockCreateSkill = jest.fn();
const mockListSkills = jest.fn();

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: {
      ...actual.dataService,
      createSkill: (...args: unknown[]) => mockCreateSkill(...args),
      listSkills: (...args: unknown[]) => mockListSkills(...args),
    },
  };
});

function makeSkill(id: string, name: string): TSkill {
  return {
    _id: id,
    name,
    description: `${name} description`,
    body: `# ${name}`,
    author: 'user-1',
    authorName: 'E2E User',
    version: 1,
    source: 'inline',
    fileCount: 0,
    createdAt: '2026-07-24T00:00:00.000Z',
    updatedAt: '2026-07-24T00:00:00.000Z',
  } as TSkill;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('skill creation cache updates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps a created skill when a stale next-page request finishes afterward', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const firstSkill = makeSkill('first-id', 'first-skill');
    const createdSkill = makeSkill('created-id', 'created-skill');
    const stalePage = deferred<TSkillListResponse>();
    const firstPage: TSkillListResponse = {
      skills: [firstSkill],
      has_more: true,
      after: 'cursor-1',
    };
    const freshPage: TSkillListResponse = {
      skills: [createdSkill, firstSkill],
      has_more: false,
      after: null,
    };
    const queryKey = [QueryKeys.skills, 'infinite', '', '', 100];
    queryClient.setQueryData(queryKey, {
      pages: [firstPage],
      pageParams: [undefined],
    });
    mockCreateSkill.mockResolvedValue(createdSkill);
    mockListSkills.mockImplementation(({ cursor }: { cursor?: string }) =>
      cursor === 'cursor-1' ? stalePage.promise : Promise.resolve(freshPage),
    );
    const cancelQueries = jest.spyOn(queryClient, 'cancelQueries');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(
      () => ({
        list: useSkillsInfiniteQuery({ limit: 100 }),
        create: useCreateSkillMutation(),
      }),
      { wrapper },
    );

    let staleRequest: Promise<unknown>;
    act(() => {
      staleRequest = result.current.list.fetchNextPage();
    });
    await waitFor(() =>
      expect(mockListSkills).toHaveBeenCalledWith(
        expect.objectContaining({ cursor: 'cursor-1', limit: 100 }),
      ),
    );

    await act(async () => {
      await result.current.create.mutateAsync({
        name: createdSkill.name,
        description: createdSkill.description,
        body: createdSkill.body,
      });
    });

    expect(cancelQueries).toHaveBeenCalledWith([QueryKeys.skills]);
    await waitFor(() =>
      expect(
        queryClient
          .getQueryData<{ pages: TSkillListResponse[] }>(queryKey)
          ?.pages.flatMap((page) => page.skills)
          .map((skill) => skill._id),
      ).toContain(createdSkill._id),
    );

    stalePage.resolve({
      skills: [makeSkill('second-id', 'second-skill')],
      has_more: false,
      after: null,
    });
    await act(async () => {
      await Promise.allSettled([staleRequest]);
    });

    expect(
      queryClient
        .getQueryData<{ pages: TSkillListResponse[] }>(queryKey)
        ?.pages.flatMap((page) => page.skills)
        .map((skill) => skill._id),
    ).toContain(createdSkill._id);

    queryClient.clear();
  });
});
