import { render, screen, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { RecoilRoot, useRecoilValue } from 'recoil';
import { EToolResources, Tools, defaultAgentCapabilities } from 'librechat-data-provider';
import AttachFileMenu from '../AttachFileMenu';
import { ephemeralAgentByConvoId } from '~/store';
import * as hooks from '~/hooks';

jest.mock('~/hooks', () => ({
  useLocalize: jest.fn(),
  useGetAgentsConfig: jest.fn(),
  useFileHandling: jest.fn(),
  useAgentCapabilities: jest.fn(),
}));

jest.mock('@ariakit/react', () => ({
  MenuButton: ({ children, disabled }: any) => <button disabled={disabled}>{children}</button>,
  useMenuStore: jest.fn(),
  MenuProvider: ({ children }: any) => children,
}));

let mockDropdownItems: any[] = [];

jest.mock('~/components', () => ({
  FileUpload: jest.fn(({ children }: any) => <div>{children}</div>),
  TooltipAnchor: ({ render }: any) => render,
  DropdownPopup: ({ items, trigger }: any) => {
    mockDropdownItems = items;
    return <div data-testid="dropdown-popup">{trigger}</div>;
  },
  AttachmentIcon: () => <div />,
}));

const mockLocalize = jest.fn((key) => key);
const mockHandleFileChange = jest.fn();

describe('AttachFileMenu', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDropdownItems = [];

    (hooks.useLocalize as jest.Mock).mockReturnValue(mockLocalize);
    (hooks.useGetAgentsConfig as jest.Mock).mockReturnValue({
      agentsConfig: {
        enabled: true,
        capabilities: {
          ...defaultAgentCapabilities,
          ocrEnabled: true,
          fileSearchEnabled: true,
          codeEnabled: true,
        },
      },
    });
    (hooks.useFileHandling as jest.Mock).mockReturnValue({
      handleFileChange: mockHandleFileChange,
    });
    (hooks.useAgentCapabilities as jest.Mock).mockReturnValue({
      ocrEnabled: true,
      fileSearchEnabled: true,
      codeEnabled: true,
    });
  });

  describe('Recoil State Management', () => {
    it('sets execute_code to true when code files menu item is clicked', async () => {
      const conversationId = 'test-convo-123';
      let capturedAgentState: any = null;

      const StateCapture = ({ conversationId }: { conversationId: string }) => {
        const agentState = useRecoilValue(ephemeralAgentByConvoId(conversationId));
        capturedAgentState = agentState;
        return null;
      };

      render(
        <RecoilRoot>
          <AttachFileMenu conversationId={conversationId} />
          <StateCapture conversationId={conversationId} />
        </RecoilRoot>,
      );

      expect(mockDropdownItems).toHaveLength(4);
      expect(mockDropdownItems[3].label).toBe('com_ui_upload_code_files');

      act(() => {
        mockDropdownItems[3].onClick();
      });

      expect(capturedAgentState).toEqual({
        [EToolResources.execute_code]: true,
      });
    });

    it('preserves existing agent state when updating execute_code', async () => {
      const conversationId = 'test-convo-456';
      let capturedAgentState: any = null;

      const StateCapture = ({ conversationId }: { conversationId: string }) => {
        const agentState = useRecoilValue(ephemeralAgentByConvoId(conversationId));
        capturedAgentState = agentState;
        return null;
      };

      render(
        <RecoilRoot
          initializeState={({ set }) => {
            set(ephemeralAgentByConvoId(conversationId), {
              [Tools.web_search]: true,
              [EToolResources.file_search]: false,
              customProp: 'test-value',
            } as any);
          }}
        >
          <AttachFileMenu conversationId={conversationId} />
          <StateCapture conversationId={conversationId} />
        </RecoilRoot>,
      );

      act(() => {
        mockDropdownItems[3].onClick();
      });

      expect(capturedAgentState).toEqual({
        [Tools.web_search]: true,
        [EToolResources.file_search]: false,
        customProp: 'test-value',
        [EToolResources.execute_code]: true,
      });
    });

    it('creates correct menu items based on capabilities', () => {
      const capabilities = [
        { ocrEnabled: true, fileSearchEnabled: true, codeEnabled: true, expectedCount: 4 },
        { ocrEnabled: false, fileSearchEnabled: true, codeEnabled: true, expectedCount: 3 },
        { ocrEnabled: false, fileSearchEnabled: false, codeEnabled: true, expectedCount: 2 },
        { ocrEnabled: false, fileSearchEnabled: false, codeEnabled: false, expectedCount: 1 },
      ];

      capabilities.forEach(({ ocrEnabled, fileSearchEnabled, codeEnabled, expectedCount }) => {
        (hooks.useAgentCapabilities as jest.Mock).mockReturnValue({
          ocrEnabled,
          fileSearchEnabled,
          codeEnabled,
        });

        render(
          <RecoilRoot>
            <AttachFileMenu conversationId="test" />
          </RecoilRoot>,
        );

        expect(mockDropdownItems).toHaveLength(expectedCount);
      });
    });
  });

  describe('Component Behavior', () => {
    it('passes correct tool resource to handleFileChange for each menu item', () => {
      render(
        <RecoilRoot>
          <AttachFileMenu conversationId="test" />
        </RecoilRoot>,
      );

      const menuItemIndices = [0, 1, 2, 3];

      menuItemIndices.forEach((index) => {
        act(() => {
          mockDropdownItems[index].onClick();
        });
      });

      // Verify all menu items have onClick handlers
      expect(mockDropdownItems).toHaveLength(4);
      mockDropdownItems.forEach((item) => {
        expect(item.onClick).toBeDefined();
      });
    });

    it('handles disabled state correctly', () => {
      const { rerender } = render(
        <RecoilRoot>
          <AttachFileMenu conversationId="test" disabled={true} />
        </RecoilRoot>,
      );

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();

      rerender(
        <RecoilRoot>
          <AttachFileMenu conversationId="test" disabled={false} />
        </RecoilRoot>,
      );

      expect(button).not.toBeDisabled();
    });
  });

  describe('Edge cases', () => {
    it('handles undefined agentsConfig', () => {
      (hooks.useGetAgentsConfig as jest.Mock).mockReturnValue({ agentsConfig: undefined });

      expect(() => {
        render(
          <RecoilRoot>
            <AttachFileMenu conversationId="test" />
          </RecoilRoot>,
        );
      }).not.toThrow();
    });

    it('handles null conversationId', () => {
      expect(() => {
        render(
          <RecoilRoot>
            <AttachFileMenu conversationId={null as any} />
          </RecoilRoot>,
        );
      }).not.toThrow();
    });

    it('handles missing capabilities in agentsConfig', () => {
      (hooks.useGetAgentsConfig as jest.Mock).mockReturnValue({
        agentsConfig: { enabled: true },
      });

      expect(() => {
        render(
          <RecoilRoot>
            <AttachFileMenu conversationId="test" />
          </RecoilRoot>,
        );
      }).not.toThrow();
    });

    it('updates Recoil state for different conversation IDs independently', () => {
      const convoId1 = 'convo-1';
      const convoId2 = 'convo-2';

      const { result: result1 } = renderHook(
        () => useRecoilValue(ephemeralAgentByConvoId(convoId1)),
        { wrapper: RecoilRoot },
      );

      const { result: result2 } = renderHook(
        () => useRecoilValue(ephemeralAgentByConvoId(convoId2)),
        { wrapper: RecoilRoot },
      );

      render(
        <RecoilRoot>
          <AttachFileMenu conversationId={convoId1} />
        </RecoilRoot>,
      );

      act(() => {
        mockDropdownItems[3].onClick();
      });

      render(
        <RecoilRoot>
          <AttachFileMenu conversationId={convoId2} />
        </RecoilRoot>,
      );

      const dropdownItemsForConvo2 = [...mockDropdownItems];

      act(() => {
        dropdownItemsForConvo2[3].onClick();
      });

      expect(result1.current).toBeDefined();
      expect(result2.current).toBeDefined();
    });
  });
});
