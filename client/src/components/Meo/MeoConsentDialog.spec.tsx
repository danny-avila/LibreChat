import { fireEvent, render, screen } from '@testing-library/react';
import MeoConsentDialog from './MeoConsentDialog';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) => {
      if (key === 'meo_web_consent_summary') {
        return `${values?.provider} · ${values?.model}. Purpose: ${values?.purpose}. Data: ${values?.categories}. Destination: ${values?.destination}. ${values?.count} characters.`;
      }
      return (
        {
          meo_web_consent_title: 'Send this message to a provider?',
          meo_web_consent_cancel: 'Cancel',
          meo_web_consent_continue: 'Continue',
        }[key] ?? key
      );
    },
  }),
}));

const consent = {
  requestId: 'request-1',
  payloadSha256: 'sha256',
  confirmationVersion: 1,
  providerName: 'OpenLux',
  model: 'qwen3-test',
  purpose: 'meo_ai_web_chat',
  dataCategories: ['conversation_text'],
  destination: 'OpenLux API',
  promptCharacters: 24,
};

describe('MeoConsentDialog', () => {
  it('shows the provider data scope and resolves approval explicitly', () => {
    const onResolve = jest.fn();
    render(<MeoConsentDialog consent={consent} onResolve={onResolve} />);

    expect(
      screen.getByRole('alertdialog', { name: 'Send this message to a provider?' }),
    ).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText(/OpenLux · qwen3-test/)).toBeInTheDocument();
    expect(screen.getByText(/conversation_text/)).toBeInTheDocument();
    expect(screen.getByText(/OpenLux API/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onResolve).toHaveBeenCalledWith(true);
  });

  it('cancels when Escape is pressed', () => {
    const onResolve = jest.fn();
    render(<MeoConsentDialog consent={consent} onResolve={onResolve} />);

    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    expect(onResolve).toHaveBeenCalledWith(false);
  });
});
