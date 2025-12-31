import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { RecoilRoot } from 'recoil';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AttachFile from '~/components/Chat/Input/Files/AttachFile';
import store from '~/store';

// Mock all the hooks
jest.mock('~/hooks', () => ({
  useFileHandling: jest.fn(),
  useLocalize: jest.fn(),
}));

const mockUseFileHandling = jest.requireMock('~/hooks').useFileHandling;
const mockUseLocalize = jest.requireMock('~/hooks').useLocalize;

describe('AttachFile', () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  const mockHandleFileChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock implementations
    mockUseLocalize.mockReturnValue((key: string) => {
      const translations: Record<string, string> = {
        com_sidepanel_attach_files: 'Attach Files',
      };
      return translations[key] || key;
    });

    mockUseFileHandling.mockReturnValue({
      handleFileChange: mockHandleFileChange,
    });
  });

  const renderAttachFile = (props: any = {}, initialRecoilState?: (MutableSnapshot) => void) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <RecoilRoot initializeState={initialRecoilState}>
          <AttachFile {...props} />
        </RecoilRoot>
      </QueryClientProvider>,
    );
  };

  describe('Additional metadata', () => {
    it('should pass additional metadata w/ temporary status to file handler', () => {
      renderAttachFile({}, ({ set }) => set(store.isTemporary, true));

      expect(mockUseFileHandling).toHaveBeenCalledWith({
        additionalMetadata: { temporary: 'true' },
      });
    });
  });
});
