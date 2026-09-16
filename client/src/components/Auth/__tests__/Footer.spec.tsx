import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import type { TStartupConfig } from 'librechat-data-provider';
import Footer from '../Footer';

/**
 * IA patch "login footer": the login page renders `interface.loginFooter` as
 * Markdown, `|` separating the parts — the shape the chat footer gives
 * `customFooter`, but a field of its own, because the two footers carry text
 * from different authors.
 *
 * These tests fail if the render moves out of this component or the field is
 * dropped from `startupConfig.interface` on a rebase.
 */
jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

const config = (iface: Partial<NonNullable<TStartupConfig['interface']>>) =>
  ({ interface: iface }) as TStartupConfig;

describe('Auth Footer — interface.loginFooter', () => {
  test('renders the configured text', () => {
    render(<Footer startupConfig={config({ loginFooter: 'Operated by Example Hosting' })} />);

    expect(screen.getByText('Operated by Example Hosting')).toBeInTheDocument();
  });

  test('renders Markdown links, opening them in a new tab', () => {
    render(
      <Footer
        startupConfig={config({ loginFooter: '[Example Hosting](https://example-hosting.com)' })}
      />,
    );

    const link = screen.getByRole('link', { name: 'Example Hosting' });
    expect(link).toHaveAttribute('href', 'https://example-hosting.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  test('splits on the pipe into separate parts', () => {
    render(<Footer startupConfig={config({ loginFooter: 'Erster Teil | Zweiter Teil' })} />);

    expect(screen.getByText('Erster Teil')).toBeInTheDocument();
    expect(screen.getByText('Zweiter Teil')).toBeInTheDocument();
  });

  test('keeps the policy links beside it rather than replacing them', () => {
    render(
      <Footer
        startupConfig={config({
          loginFooter: 'Operated by Example Hosting',
          privacyPolicy: { externalUrl: 'https://example.com/privacy' },
          termsOfService: { externalUrl: 'https://example.com/tos' },
        })}
      />,
    );

    expect(screen.getByText('Operated by Example Hosting')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'com_ui_privacy_policy' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'com_ui_terms_of_service' })).toBeInTheDocument();
  });

  test('renders nothing extra when the field is unset', () => {
    const { container } = render(
      <Footer
        startupConfig={config({ privacyPolicy: { externalUrl: 'https://example.com/privacy' } })}
      />,
    );

    expect(screen.getByRole('link', { name: 'com_ui_privacy_policy' })).toBeInTheDocument();
    expect(container.querySelectorAll('a')).toHaveLength(1);
  });

  test('ignores an empty value instead of drawing a divider for it', () => {
    const { container } = render(
      <Footer
        startupConfig={config({
          loginFooter: '   ',
          privacyPolicy: { externalUrl: 'https://example.com/privacy' },
        })}
      />,
    );

    expect(container.querySelectorAll('.border-r-\\[1px\\]')).toHaveLength(0);
  });

  test('renders nothing at all without a startup config', () => {
    const { container } = render(<Footer startupConfig={null} />);

    expect(container).toBeEmptyDOMElement();
  });
});
