import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HarveySyncPanel from '../HarveySyncPanel';
import { ProjectsApiError } from '~/data-provider/Projects';
import type { ProjectDetail } from '~/data-provider/Projects';

// jest.mock 팩토리는 mock* 접두 변수만 참조할 수 있다 (호이스팅 보호).
const mockMutateAsync = jest.fn();
const mockShowToast = jest.fn();
const mockState = { isLoading: false };

jest.mock('~/data-provider/Projects', () => {
  const actual = jest.requireActual('~/data-provider/Projects');
  return {
    ...actual,
    useHarveySync: () => ({
      mutateAsync: mockMutateAsync,
      isLoading: mockState.isLoading,
    }),
  };
});

jest.mock('@librechat/client', () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Spinner: (props: any) => <span data-testid="spinner" {...props} />,
  useToastContext: () => ({ showToast: mockShowToast }),
}));

function project(overrides: Partial<ProjectDetail> = {}): ProjectDetail {
  return {
    project_id: 'p1',
    name: '계약검토',
    description: null,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    document_count: 3,
    documents: [],
    ...overrides,
  } as ProjectDetail;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockState.isLoading = false;
  mockMutateAsync.mockResolvedValue({ started: true });
});

describe('HarveySyncPanel', () => {
  it('보낸 적 없으면 전송 버튼을 제공한다', () => {
    render(<HarveySyncPanel project={project()} />);
    expect(screen.getByRole('button', { name: /Harvey로 보내기/ })).toBeEnabled();
  });

  it('담긴 문서가 없으면 전송할 수 없다', () => {
    render(<HarveySyncPanel project={project({ document_count: 0 })} />);
    expect(screen.getByRole('button', { name: /Harvey로 보내기/ })).toBeDisabled();
  });

  it('클릭하면 동기화를 시작하고 안내를 띄운다', async () => {
    render(<HarveySyncPanel project={project()} />);

    await userEvent.click(screen.getByRole('button', { name: /Harvey로 보내기/ }));

    expect(mockMutateAsync).toHaveBeenCalledWith({ projectId: 'p1' });
    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith(expect.objectContaining({ status: 'success' })),
    );
  });

  it('진행 중에는 진행률을 보여주고 중복 클릭을 막는다', () => {
    render(
      <HarveySyncPanel
        project={project({ harvey_sync_status: 'syncing', harvey_synced_count: 1 })}
      />,
    );

    expect(screen.getByText(/보내는 중 \(1\/3\)/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /전송 중/ })).toBeDisabled();
  });

  it('완료되면 건수를 보여주고 다시 보내기를 허용한다', () => {
    render(
      <HarveySyncPanel
        project={project({
          harvey_sync_status: 'synced',
          harvey_synced_count: 3,
          harvey_synced_at: '2026-09-15T01:30:00Z',
        })}
      />,
    );

    expect(screen.getByText(/Harvey에 3건 전송 완료/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /다시 보내기/ })).toBeEnabled();
  });

  it('일부만 갔으면 남은 사실과 이유를 보여준다', () => {
    render(
      <HarveySyncPanel
        project={project({
          harvey_sync_status: 'partial',
          harvey_synced_count: 2,
          harvey_sync_error: '1건 원본 확보 실패',
        })}
      />,
    );

    expect(screen.getByText(/2\/3건 전송 — 일부가 남았습니다/)).toBeInTheDocument();
    expect(screen.getByText('1건 원본 확보 실패')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /다시 시도/ })).toBeEnabled();
  });

  it('공유된 주소를 보여준다', () => {
    render(
      <HarveySyncPanel
        project={project({
          harvey_sync_status: 'synced',
          harvey_shared_emails: ['user@bkl.co.kr'],
        })}
      />,
    );

    expect(screen.getByText(/user@bkl.co.kr 에게 공유됨/)).toBeInTheDocument();
  });

  it('토큰 미설정(503)은 설정 문제임을 알려준다', async () => {
    mockMutateAsync.mockRejectedValue(
      new ProjectsApiError('Harvey 연동이 설정되지 않았습니다 (HARVEY_API_TOKEN)', 503),
    );
    render(<HarveySyncPanel project={project()} />);

    await userEvent.click(screen.getByRole('button', { name: /Harvey로 보내기/ }));

    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
          message: expect.stringContaining('아직 설정되지 않았습니다'),
        }),
      ),
    );
  });

  it('이미 진행 중(409)이면 서버 문구를 그대로 보여준다', async () => {
    mockMutateAsync.mockRejectedValue(new ProjectsApiError('이미 동기화가 진행 중입니다', 409));
    render(<HarveySyncPanel project={project()} />);

    await userEvent.click(screen.getByRole('button', { name: /Harvey로 보내기/ }));

    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith({
        status: 'error',
        message: '이미 동기화가 진행 중입니다',
      }),
    );
  });
});
