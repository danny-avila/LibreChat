import 'test/resizeObserver.mock';
import 'test/matchMedia.mock';
import 'test/localStorage.mock';

import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { RecoilRoot } from 'recoil';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';

import { AuthContextProvider } from '~/hooks/AuthContext';
import { SearchContext } from '~/Providers';
import Nav from './Nav';

const renderNav = ({ search, navVisible, setNavVisible }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <RecoilRoot>
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>
          <AuthContextProvider>
            <SearchContext.Provider value={search}>
              <Nav navVisible={navVisible} setNavVisible={setNavVisible} />
            </SearchContext.Provider>
          </AuthContextProvider>
        </QueryClientProvider>
      </BrowserRouter>
    </RecoilRoot>,
  );
};

const mockMatchMedia = (mediaQueryList?: string[]) => {
  mediaQueryList = mediaQueryList || [];

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query) => ({
      matches: mediaQueryList.includes(query),
      media: query,
      onchange: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
};

describe('Nav', () => {
  beforeEach(() => {
    mockMatchMedia();
  });

  it('renders visible', () => {
    const { getByTestId } = renderNav({
      search: { data: [], pageNumber: 1 },
      navVisible: true,
      setNavVisible: jest.fn(),
    });

    expect(getByTestId('nav')).toBeVisible();
  });

  it('renders hidden', async () => {
    const { getByTestId } = renderNav({
      search: { data: [], pageNumber: 1 },
      navVisible: false,
      setNavVisible: jest.fn(),
    });

    expect(getByTestId('nav')).not.toBeVisible();
  });

  it('renders hidden when small screen is detected', async () => {
    mockMatchMedia(['(max-width: 768px)']);

    const navVisible = true;
    const mockSetNavVisible = jest.fn();

    const { getByTestId } = renderNav({
      search: { data: [], pageNumber: 1 },
      navVisible: navVisible,
      setNavVisible: mockSetNavVisible,
    });

    // nav is initially visible
    expect(getByTestId('nav')).toBeVisible();

    // when small screen is detected, the nav is hidden
    expect(mockSetNavVisible.mock.calls).toHaveLength(1);
    const updatedNavVisible = mockSetNavVisible.mock.calls[0][0](navVisible);
    expect(updatedNavVisible).not.toEqual(navVisible);
    expect(updatedNavVisible).toBeFalsy();
  });
});
