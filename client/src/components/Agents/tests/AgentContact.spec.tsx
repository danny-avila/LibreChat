import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import AgentContact from '../AgentContact';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => {
    const translations: Record<string, string> = {
      com_agents_contact: 'Contact',
      com_agents_no_contact_available: 'No contact available',
    };
    return translations[key] || key;
  },
}));

jest.mock('~/utils', () => ({
  cn: (...classes: string[]) => classes.filter(Boolean).join(' '),
}));

describe('AgentContact', () => {
  it('uses support contact before owner contact', () => {
    render(
      <AgentContact
        resource={{
          support_contact: { name: 'Support Team', email: 'support@example.com' },
          owner_contact: { name: 'Owner User' },
        }}
      />,
    );

    expect(screen.getByText('Contact:')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Support Team' })).toHaveAttribute(
      'href',
      'mailto:support@example.com',
    );
    expect(screen.queryByText('Owner User')).not.toBeInTheDocument();
  });

  it('falls back to owner contact as a plain name without a mailto link', () => {
    render(
      <AgentContact
        resource={{
          support_contact: undefined,
          owner_contact: { name: 'Owner User' },
        }}
      />,
    );

    expect(screen.getByText('Owner User')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('uses the support email as the linked label when no name exists', () => {
    render(<AgentContact resource={{ support_contact: { email: 'support@example.com' } }} />);

    expect(screen.getByRole('link', { name: 'support@example.com' })).toHaveAttribute(
      'href',
      'mailto:support@example.com',
    );
  });

  it('renders a support name without a link when no email exists', () => {
    render(<AgentContact resource={{ support_contact: { name: 'Support Team' } }} />);

    expect(screen.getByText('Support Team')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders no-contact text when no contact is available', () => {
    render(<AgentContact resource={{ support_contact: {}, owner_contact: undefined }} />);

    expect(screen.getByText('No contact available')).toBeInTheDocument();
  });
});
