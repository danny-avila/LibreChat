/**
 * 첨부 버튼 동작 (2026-08-31).
 *
 * BKL 은 업로드 경로가 하나(context)뿐이라, 첨부 버튼을 누르면 메뉴를
 * 거치지 않고 바로 파일 선택창이 열려야 한다. 예전에는 "새파일 업로드 /
 * 기존파일 임포트" 두 항목짜리 드롭다운이 떴다.
 *
 * SharePoint 를 켜면 고를 게 둘이 되므로 그때만 드롭다운으로 돌아간다.
 * BKL 배포에서는 꺼져 있다.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { RecoilRoot } from 'recoil';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EModelEndpoint } from 'librechat-data-provider';
import AttachFileMenu from '../AttachFileMenu';

jest.mock('~/hooks', () => ({
  useAgentCapabilities: jest.fn(),
  useGetAgentsConfig: jest.fn(),
  useFileHandling: jest.fn(),
  useLocalize: jest.fn(),
}));

jest.mock('~/hooks/Files/useSharePointFileHandling', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: jest.fn(),
}));

jest.mock('~/components/SharePoint', () => ({
  SharePointPickerDialog: () => null,
}));

jest.mock('@librechat/client', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const R = require('react');
  return {
    // 실제 FileUpload 는 자식에 ref 를 꽂아 <input type=file> 을 붙인다.
    // 여기서는 클릭 여부만 보면 되므로 숨김 input 을 직접 노출한다.
    FileUpload: R.forwardRef((props, ref) =>
      R.createElement(
        'div',
        { 'data-testid': 'file-upload' },
        R.createElement('input', { type: 'file', ref, 'data-testid': 'file-input' }),
        props.children,
      ),
    ),
    TooltipAnchor: (props) => props.render,
    DropdownPopup: (props) =>
      R.createElement(
        'div',
        null,
        R.createElement('div', { onClick: () => props.setIsOpen(!props.isOpen) }, props.trigger),
        props.isOpen &&
          R.createElement(
            'div',
            { 'data-testid': 'dropdown-menu' },
            props.items.map((item, idx) =>
              R.createElement(
                'button',
                { key: idx, onClick: item.onClick, 'data-testid': `menu-item-${idx}` },
                item.label,
              ),
            ),
          ),
      ),
    AttachmentIcon: () => R.createElement('span', { 'data-testid': 'attachment-icon' }),
    SharePointIcon: () => R.createElement('span', { 'data-testid': 'sharepoint-icon' }),
  };
});

jest.mock('@ariakit/react', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const R = require('react');
  return {
    MenuButton: (props) => R.createElement('button', props, props.children),
  };
});

const mockUseAgentCapabilities = jest.requireMock('~/hooks').useAgentCapabilities;
const mockUseGetAgentsConfig = jest.requireMock('~/hooks').useGetAgentsConfig;
const mockUseFileHandling = jest.requireMock('~/hooks').useFileHandling;
const mockUseLocalize = jest.requireMock('~/hooks').useLocalize;
const mockUseSharePointFileHandling = jest.requireMock(
  '~/hooks/Files/useSharePointFileHandling',
).default;
const mockUseGetStartupConfig = jest.requireMock('~/data-provider').useGetStartupConfig;

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function setupMocks({ contextEnabled = true, sharePoint = false } = {}) {
  const translations: Record<string, string> = {
    com_sidepanel_attach_files: 'Attach Files',
    com_files_upload_sharepoint: 'Upload from SharePoint',
  };
  mockUseLocalize.mockReturnValue((key: string) => translations[key] || key);
  mockUseAgentCapabilities.mockReturnValue({ contextEnabled });
  mockUseGetAgentsConfig.mockReturnValue({ agentsConfig: {} });
  mockUseFileHandling.mockReturnValue({ handleFileChange: jest.fn() });
  mockUseSharePointFileHandling.mockReturnValue({
    handleSharePointFiles: jest.fn(),
    isProcessing: false,
    downloadProgress: 0,
  });
  mockUseGetStartupConfig.mockReturnValue({
    data: { sharePointFilePickerEnabled: sharePoint },
  });
}

function renderMenu(props: Record<string, unknown> = {}) {
  return render(
    <QueryClientProvider client={queryClient}>
      <RecoilRoot>
        <AttachFileMenu conversationId="test-convo" {...props} />
      </RecoilRoot>
    </QueryClientProvider>,
  );
}

const attachButton = () => screen.getByRole('button', { name: /attach file options/i });

/** 숨은 file input 의 click 을 가로채 호출 여부를 본다. */
function spyOnFilePicker() {
  const input = screen.getByTestId('file-input') as HTMLInputElement;
  const spy = jest.fn();
  input.click = spy;
  return { input, spy };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('첨부 버튼 — 바로 업로드', () => {
  it('클릭하면 메뉴 없이 파일 선택창이 열린다', () => {
    setupMocks();
    renderMenu({ endpointType: EModelEndpoint.openAI });
    const { spy } = spyOnFilePicker();

    fireEvent.click(attachButton());

    expect(spy).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('dropdown-menu')).not.toBeInTheDocument();
  });

  it('"기존파일 임포트" 를 더 이상 노출하지 않는다', () => {
    setupMocks();
    renderMenu({ endpointType: EModelEndpoint.openAI });
    fireEvent.click(attachButton());
    expect(screen.queryByText('기존파일 임포트')).not.toBeInTheDocument();
  });

  it('"새파일 업로드" 라는 중간 선택지도 띄우지 않는다', () => {
    setupMocks();
    renderMenu({ endpointType: EModelEndpoint.openAI });
    fireEvent.click(attachButton());
    expect(screen.queryByText('새파일 업로드')).not.toBeInTheDocument();
  });

  it('허용 확장자를 input.accept 에 세팅한다', () => {
    setupMocks();
    renderMenu({ endpointType: EModelEndpoint.openAI });
    const { input } = spyOnFilePicker();

    fireEvent.click(attachButton());

    expect(input.accept).not.toBe('');
    expect(input.accept).toContain('.pdf');
  });

  it('연속으로 같은 파일을 올릴 수 있도록 value 를 비운다', () => {
    setupMocks();
    renderMenu({ endpointType: EModelEndpoint.openAI });
    const { input } = spyOnFilePicker();

    fireEvent.click(attachButton());

    expect(input.value).toBe('');
  });
});

describe('버튼 상태', () => {
  it('기본 렌더', () => {
    setupMocks();
    renderMenu();
    expect(attachButton()).toBeInTheDocument();
  });

  it('disabled=true 면 비활성', () => {
    setupMocks();
    renderMenu({ disabled: true });
    expect(attachButton()).toBeDisabled();
  });

  it('disabled=false 면 활성', () => {
    setupMocks();
    renderMenu({ disabled: false });
    expect(attachButton()).not.toBeDisabled();
  });

  it('endpoint 가 없어도 죽지 않는다', () => {
    setupMocks();
    renderMenu({ endpoint: undefined, endpointType: undefined });
    expect(attachButton()).toBeInTheDocument();
  });

  it('endpoint 가 null 이어도 죽지 않는다', () => {
    setupMocks();
    renderMenu({ endpoint: null, endpointType: null });
    expect(attachButton()).toBeInTheDocument();
  });
});

describe('SharePoint 가 켜졌을 때만 드롭다운', () => {
  it('꺼져 있으면 드롭다운을 만들지 않는다', () => {
    setupMocks({ sharePoint: false });
    renderMenu({ endpointType: EModelEndpoint.openAI });
    fireEvent.click(attachButton());
    expect(screen.queryByTestId('dropdown-menu')).not.toBeInTheDocument();
  });

  it('켜져 있으면 업로드 / SharePoint 두 항목이 나온다', () => {
    setupMocks({ sharePoint: true });
    renderMenu({ endpointType: EModelEndpoint.openAI });

    fireEvent.click(attachButton());

    expect(screen.getByTestId('dropdown-menu')).toBeInTheDocument();
    expect(screen.getByText('새파일 업로드')).toBeInTheDocument();
    expect(screen.getByText('Upload from SharePoint')).toBeInTheDocument();
    expect(screen.queryByText('기존파일 임포트')).not.toBeInTheDocument();
  });

  it('드롭다운의 업로드 항목도 파일 선택창을 연다', () => {
    setupMocks({ sharePoint: true });
    renderMenu({ endpointType: EModelEndpoint.openAI });
    const { spy } = spyOnFilePicker();

    fireEvent.click(attachButton());
    fireEvent.click(screen.getByText('새파일 업로드'));

    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('context capability', () => {
  it('꺼져 있으면 SharePoint 가 켜져도 드롭다운을 만들지 않는다', () => {
    setupMocks({ contextEnabled: false, sharePoint: true });
    renderMenu({ endpointType: EModelEndpoint.openAI });
    fireEvent.click(attachButton());
    expect(screen.queryByTestId('dropdown-menu')).not.toBeInTheDocument();
  });
});
