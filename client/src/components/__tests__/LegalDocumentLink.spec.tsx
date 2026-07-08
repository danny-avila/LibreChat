import { render, screen } from 'test/layout-test-utils';
import { LegalDocumentLink } from '~/components/LegalDocumentLink';

describe('LegalDocumentLink', () => {
  it('renders nothing when externalUrl is missing', () => {
    const { container } = render(
      <LegalDocumentLink config={{ openNewTab: true }} labelKey="com_ui_privacy_policy" />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('opens in a new tab with WCAG attributes when openNewTab is true', () => {
    render(
      <LegalDocumentLink
        config={{ externalUrl: 'https://example.com/privacy', openNewTab: true }}
        labelKey="com_ui_privacy_policy"
      />,
    );

    const link = screen.getByRole('link', { name: 'Privacy policy (opens in new tab)' });
    expect(link).toHaveAttribute('href', 'https://example.com/privacy');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('does not set target when openNewTab is false', () => {
    render(
      <LegalDocumentLink
        config={{ externalUrl: 'https://example.com/terms', openNewTab: false }}
        labelKey="com_ui_terms_of_service"
      />,
    );

    const link = screen.getByRole('link', { name: 'Terms of service' });
    expect(link).not.toHaveAttribute('target');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
