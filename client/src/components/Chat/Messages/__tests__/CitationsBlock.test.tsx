import { render, screen } from '@testing-library/react';
import CitationsBlock from '../CitationsBlock';

jest.mock('~/components/Pdf/PdfViewer', () => function MockPdfViewer() {
  return null;
});

describe('CitationsBlock', () => {
  it('renders nothing when citations are absent', () => {
    const { container } = render(<CitationsBlock citations={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('maps Ontario citations to the Ontario PDF metadata', () => {
    render(
      <CitationsBlock
        citations={[
          {
            id: 'citation-1',
            url: 'ontario_page_24.json',
          },
        ]}
      />,
    );

    expect(screen.getByRole('heading', { name: /Citations/i })).toBeInTheDocument();
    expect(screen.getByText('Ontario Building Code 2024')).toBeInTheDocument();
    expect(screen.getByText('(p. 24)', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /View PDF/i })).toBeInTheDocument();
  });

  it('maps Ontario alias keys and National keys correctly', () => {
    render(
      <CitationsBlock
        citations={[
          {
            id: 'citation-2',
            url: 'ontario_combined_page_15.json',
          },
          {
            id: 'citation-3',
            url: 'nbc2020_page_50.json',
          },
        ]}
      />,
    );

    expect(screen.getByText('(p. 15)', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('(p. 50)', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('National Building Code of Canada 2020')).toBeInTheDocument();
  });
});
