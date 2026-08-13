import { FormProvider, useForm } from 'react-hook-form';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { MCPServerFormData } from '../../hooks/useMCPServerForm';
import BasicInfoSection from '../BasicInfoSection';

jest.mock('~/components/SidePanel/Agents/MCPIcon', () => () => <div data-testid="mcp-icon" />);

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => {
    const translations: Record<string, string> = {
      com_ui_name: 'Name',
      com_ui_description: 'Description',
      com_ui_optional: 'Optional',
      com_ui_support_contact: 'Support Contact',
      com_ui_support_contact_name: 'Support name',
      com_ui_support_contact_name_placeholder: 'Support contact name',
      com_ui_support_contact_name_min_length: 'Name must be at least 3 characters',
      com_ui_support_contact_email: 'Support email',
      com_ui_support_contact_email_placeholder: 'support@example.com',
      com_ui_support_contact_email_invalid: 'Please enter a valid email address',
    };
    return translations[key] ?? key;
  },
}));

const defaultValues: MCPServerFormData = {
  title: 'Example',
  description: '',
  support_contact: { name: 'Platform Team', email: 'platform@example.com' },
  icon: '',
  url: 'https://example.com/mcp',
  type: 'streamable-http',
  auth: { auth_type: 'none' as MCPServerFormData['auth']['auth_type'] },
  trust: true,
};

function renderSection() {
  function Wrapper() {
    const methods = useForm<MCPServerFormData>({ defaultValues, mode: 'onChange' });
    return (
      <FormProvider {...methods}>
        <BasicInfoSection />
      </FormProvider>
    );
  }
  return render(<Wrapper />);
}

describe('BasicInfoSection support contact', () => {
  it('prepopulates name and email independently', () => {
    renderSection();

    expect(screen.getByLabelText('Support name Optional')).toHaveValue('Platform Team');
    expect(screen.getByLabelText('Support email Optional')).toHaveValue('platform@example.com');
  });

  it('validates a non-empty short name', async () => {
    renderSection();

    fireEvent.change(screen.getByLabelText('Support name Optional'), { target: { value: 'ab' } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Name must be at least 3 characters');
    });
  });

  it('validates a malformed email and allows an empty email', async () => {
    renderSection();
    const email = screen.getByLabelText('Support email Optional');

    fireEvent.change(email, { target: { value: 'invalid' } });
    await waitFor(() => {
      expect(screen.getByText('Please enter a valid email address')).toBeInTheDocument();
    });

    fireEvent.change(email, { target: { value: '' } });
    await waitFor(() => {
      expect(screen.queryByText('Please enter a valid email address')).not.toBeInTheDocument();
    });
  });
});
