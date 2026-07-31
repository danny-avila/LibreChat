import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/extend-expect';
import CustomUserVarsSection from '../CustomUserVarsSection';

const authValuesResponse: {
  authValueFlags: Record<string, boolean>;
  authValues?: Record<string, string>;
} = {
  authValueFlags: {},
};

jest.mock('~/data-provider/Tools/queries', () => ({
  useMCPAuthValuesQuery: () => ({ data: authValuesResponse }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

describe('CustomUserVarsSection', () => {
  const fields = {
    api_key: { title: 'My API Key', description: 'Your API key' },
  };

  beforeEach(() => {
    authValuesResponse.authValueFlags = {};
    authValuesResponse.authValues = {};
  });

  it('renders autofill-prevention attributes on credential inputs', () => {
    render(
      <CustomUserVarsSection
        serverName="test-server"
        fields={fields}
        onSave={jest.fn()}
        onRevoke={jest.fn()}
      />,
    );

    const input = screen.getByLabelText(/My API Key/);
    expect(input).toHaveAttribute('autocomplete', 'new-password');
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveAttribute('data-lpignore', 'true');
    expect(input).toHaveAttribute('data-1p-ignore', 'true');
  });

  it('renders non-sensitive fields as unmasked text while keeping secrets masked', () => {
    render(
      <CustomUserVarsSection
        serverName="test-server"
        fields={{
          api_key: { title: 'My API Key', description: 'Your API key' },
          project_key: { title: 'Project Key', description: 'Your project key', sensitive: false },
        }}
        onSave={jest.fn()}
        onRevoke={jest.fn()}
      />,
    );

    expect(screen.getByLabelText(/My API Key/)).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText(/Project Key/)).toHaveAttribute('type', 'text');
  });

  it('renders a select for fields declaring predefined values and submits the chosen value', async () => {
    const onSave = jest.fn();
    render(
      <CustomUserVarsSection
        serverName="test-server"
        fields={{
          region: {
            title: 'Region',
            description: 'Target region',
            sensitive: false,
            values: ['eu-west-1', { value: 'us-east-1', label: 'US East (N. Virginia)' }],
          },
        }}
        onSave={onSave}
        onRevoke={jest.fn()}
      />,
    );

    const select = screen.getByLabelText(/Region/);
    expect(select).toHaveTextContent('com_ui_mcp_select_var');

    await userEvent.click(select);
    await userEvent.click(await screen.findByText('US East (N. Virginia)'));
    expect(select).toHaveTextContent('US East (N. Virginia)');

    await userEvent.click(screen.getByText('com_ui_save'));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ region: 'us-east-1' }));
  });

  it('joins selections with a comma for multiple fields', async () => {
    const onSave = jest.fn();
    render(
      <CustomUserVarsSection
        serverName="test-server"
        fields={{
          scopes: {
            title: 'Scopes',
            description: 'Granted scopes',
            sensitive: false,
            values: ['read', 'write', 'admin'],
            multiple: true,
          },
        }}
        onSave={onSave}
        onRevoke={jest.fn()}
      />,
    );

    await userEvent.click(screen.getByLabelText(/Scopes/));
    await userEvent.click(await screen.findByText('read'));
    await userEvent.click(await screen.findByText('write'));

    await userEvent.click(screen.getByText('com_ui_save'));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ scopes: 'read,write' }));
  });

  it('clears a preselected select after revoking', async () => {
    authValuesResponse.authValueFlags = { region: true };
    authValuesResponse.authValues = { region: 'eu-west-1' };
    const onRevoke = jest.fn();

    render(
      <CustomUserVarsSection
        serverName="test-server"
        fields={{
          region: {
            title: 'Region',
            description: 'Target region',
            sensitive: false,
            values: ['eu-west-1', 'us-east-1'],
          },
        }}
        onSave={jest.fn()}
        onRevoke={onRevoke}
      />,
    );

    const select = screen.getByLabelText(/Region/);
    await waitFor(() => expect(select).toHaveTextContent('eu-west-1'));

    await userEvent.click(screen.getByText('com_ui_revoke'));

    expect(onRevoke).toHaveBeenCalled();
    expect(select).toHaveTextContent('com_ui_mcp_select_var');
    expect(select).not.toHaveTextContent('eu-west-1');
  });

  it('preselects the value disclosed for a non-sensitive select', async () => {
    authValuesResponse.authValueFlags = { region: true };
    authValuesResponse.authValues = { region: 'eu-west-1' };

    render(
      <CustomUserVarsSection
        serverName="test-server"
        fields={{
          region: {
            title: 'Region',
            description: 'Target region',
            sensitive: false,
            values: ['eu-west-1', 'us-east-1'],
          },
        }}
        onSave={jest.fn()}
        onRevoke={jest.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByLabelText(/Region/)).toHaveTextContent('eu-west-1'));
  });
});
