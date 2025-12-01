import Header from '~/components/Chat/Header';
import * as endpointQueries from '~/data-provider/Endpoints/queries';
import { render } from 'test/layout-test-utils';

// Mock useOutletContext; needs to be run first
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useOutletContext: () => ({ navVisible: false }),
}));

describe('Header NJ customizations', () => {
  beforeAll(() => {
    jest
      .spyOn(endpointQueries, 'useGetStartupConfig')
      //@ts-ignore - we don't need all parameters of the QueryObserverSuccessResult
      .mockReturnValue({});
  });

  test('Model selector button is hidden', () => {
    const dom = render(<Header />);

    // Verify model selector button is hidden
    const temporaryChatButton = dom.container.querySelector('[aria-label="Select a model"]');
    expect(temporaryChatButton).not.toBeInTheDocument();
  });

  test('Temporary chat + export & share buttons are disabled', () => {
    const dom = render(<Header />);

    // Verify temporary chat button is hidden
    const temporaryChatButton = dom.container.querySelector('[aria-label="Temporary Chat"]');
    expect(temporaryChatButton).not.toBeInTheDocument();

    // Verify the export & share button is hidden
    const exportButton = dom.container.querySelector('#export-menu-button');
    expect(exportButton).not.toBeInTheDocument();
  });

  test('Temporary chat + export & share buttons are disabled (small screen)', () => {
    // Match the "small screen" query
    window.matchMedia = jest.fn().mockImplementation((query) => ({
      matches: query === '(max-width: 768px)',
      media: '',
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));

    const dom = render(<Header />);

    // Verify temporary chat button is hidden
    const temporaryChatButton = dom.container.querySelector('[aria-label="Temporary Chat"]');
    expect(temporaryChatButton).not.toBeInTheDocument();

    // Verify the export & share button is hidden
    const exportButton = dom.container.querySelector('#export-menu-button');
    expect(exportButton).not.toBeInTheDocument();
  });
});
