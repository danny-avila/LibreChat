/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { useForm, FormProvider } from 'react-hook-form';
import CustomUserVarsDefinitionSection from '../sections/CustomUserVarsDefinitionSection';
import type { MCPServerFormData } from '../hooks/useMCPServerForm';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => {
    const t: Record<string, string> = {
      com_ui_mcp_custom_user_vars_definition: 'User Variables',
      com_ui_mcp_custom_user_vars_definition_description:
        'Define variables that users must supply when connecting to this server.',
      com_ui_mcp_add_variable: 'Add Variable',
      com_ui_mcp_no_custom_vars: 'No user variables defined.',
      com_ui_mcp_variable: 'Variable',
      com_ui_mcp_variable_key: 'Key',
      com_ui_mcp_variable_key_placeholder: 'e.g. API_KEY',
      com_ui_mcp_variable_key_invalid:
        'Key must start with a letter and contain only letters, digits, and underscores',
      com_ui_mcp_variable_title: 'Label',
      com_ui_mcp_variable_title_placeholder: 'e.g. API Key',
      com_ui_mcp_variable_description_placeholder: 'e.g. Your API key for this service',
      com_ui_description: 'Description',
      com_ui_optional: '(optional)',
      com_ui_field_required: 'This field is required',
      com_ui_delete: 'Delete',
    };
    return t[key] ?? key;
  },
}));

jest.mock('~/utils', () => ({
  cn: (...classes: (string | undefined | null | boolean)[]) => classes.filter(Boolean).join(' '),
}));

jest.mock('@librechat/client', () => {
  const ActualReact = jest.requireActual<typeof import('react')>('react');
  return {
    Input: ActualReact.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
      (props, ref) => ActualReact.createElement('input', { ref, ...props }),
    ),
    Label: ({
      children,
      htmlFor,
      ...rest
    }: {
      children: React.ReactNode;
      htmlFor?: string;
      [key: string]: unknown;
    }) => ActualReact.createElement('label', { htmlFor, ...rest }, children),
    Button: ({
      children,
      onClick,
      type,
      ...rest
    }: {
      children: React.ReactNode;
      onClick?: () => void;
      type?: 'button' | 'submit' | 'reset';
      [key: string]: unknown;
    }) =>
      ActualReact.createElement('button', { onClick, type: type ?? 'button', ...rest }, children),
    Textarea: ActualReact.forwardRef<
      HTMLTextAreaElement,
      React.TextareaHTMLAttributes<HTMLTextAreaElement>
    >((props, ref) => ActualReact.createElement('textarea', { ref, ...props })),
  };
});

jest.mock('lucide-react', () => ({
  Plus: () => null,
  Trash2: () => null,
}));

// ---------------------------------------------------------------------------
// Wrapper
// ---------------------------------------------------------------------------

interface WrapperProps {
  defaultValues?: Partial<MCPServerFormData>;
}

function Wrapper({ defaultValues = {} }: WrapperProps) {
  const methods = useForm<MCPServerFormData>({
    defaultValues: {
      title: '',
      url: '',
      type: 'streamable-http',
      auth: {
        auth_type: 'none' as MCPServerFormData['auth']['auth_type'],
        api_key: '',
        api_key_source: 'admin',
        api_key_authorization_type:
          'bearer' as MCPServerFormData['auth']['api_key_authorization_type'],
        api_key_custom_header: '',
        oauth_client_id: '',
        oauth_client_secret: '',
        oauth_authorization_url: '',
        oauth_token_url: '',
        oauth_scope: '',
      },
      trust: false,
      headers: [],
      customUserVars: [],
      chatMenu: true,
      serverInstructionsMode: 'none',
      serverInstructionsCustom: '',
      ...defaultValues,
    },
  });
  return (
    <FormProvider {...methods}>
      <CustomUserVarsDefinitionSection />
    </FormProvider>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CustomUserVarsDefinitionSection – empty state', () => {
  it('renders the section heading', () => {
    render(<Wrapper />);
    expect(screen.getByText('User Variables')).toBeInTheDocument();
  });

  it('renders the section description', () => {
    render(<Wrapper />);
    expect(
      screen.getByText('Define variables that users must supply when connecting to this server.'),
    ).toBeInTheDocument();
  });

  it('renders the "Add Variable" button', () => {
    render(<Wrapper />);
    expect(screen.getByRole('button', { name: /Add Variable/i })).toBeInTheDocument();
  });

  it('shows the empty-state message when no variables exist', () => {
    render(<Wrapper />);
    expect(screen.getByText('No user variables defined.')).toBeInTheDocument();
  });

  it('does not render any variable entry when empty', () => {
    render(<Wrapper />);
    expect(screen.queryByText('Variable 1')).not.toBeInTheDocument();
  });
});

describe('CustomUserVarsDefinitionSection – adding variables', () => {
  it('adds a variable entry with Key and Label inputs after clicking "Add Variable"', () => {
    render(<Wrapper />);
    fireEvent.click(screen.getByRole('button', { name: /Add Variable/i }));
    expect(screen.getByLabelText(/^Key/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Label/)).toBeInTheDocument();
  });

  it('shows variable counter label after adding', () => {
    render(<Wrapper />);
    fireEvent.click(screen.getByRole('button', { name: /Add Variable/i }));
    expect(screen.getByText('Variable 1')).toBeInTheDocument();
  });

  it('hides the empty-state message after adding a variable', () => {
    render(<Wrapper />);
    fireEvent.click(screen.getByRole('button', { name: /Add Variable/i }));
    expect(screen.queryByText('No user variables defined.')).not.toBeInTheDocument();
  });

  it('adds multiple variable entries', () => {
    render(<Wrapper />);
    fireEvent.click(screen.getByRole('button', { name: /Add Variable/i }));
    fireEvent.click(screen.getByRole('button', { name: /Add Variable/i }));
    expect(screen.getByText('Variable 1')).toBeInTheDocument();
    expect(screen.getByText('Variable 2')).toBeInTheDocument();
  });

  it('renders a Description textarea for each variable entry', () => {
    render(<Wrapper />);
    fireEvent.click(screen.getByRole('button', { name: /Add Variable/i }));
    expect(screen.getByPlaceholderText('e.g. Your API key for this service')).toBeInTheDocument();
  });

  it('renders Description with "(optional)" label', () => {
    render(<Wrapper />);
    fireEvent.click(screen.getByRole('button', { name: /Add Variable/i }));
    expect(screen.getByText('(optional)')).toBeInTheDocument();
  });
});

describe('CustomUserVarsDefinitionSection – pre-populated entries', () => {
  it('renders pre-existing variable entries from defaultValues', () => {
    render(
      <Wrapper
        defaultValues={{
          customUserVars: [
            { key: 'API_KEY', title: 'API Key', description: 'Your API key' },
            { key: 'INDEX', title: 'Index Name', description: '' },
          ],
        }}
      />,
    );
    expect(screen.getByText('Variable 1')).toBeInTheDocument();
    expect(screen.getByText('Variable 2')).toBeInTheDocument();
  });

  it('pre-fills key, title, and description inputs with existing values', () => {
    render(
      <Wrapper
        defaultValues={{
          customUserVars: [
            { key: 'TOKEN', title: 'Auth Token', description: 'Bearer token for auth' },
          ],
        }}
      />,
    );
    // Verify the inputs are rendered and registered under the correct field-array paths.
    const keyInput = screen.getByPlaceholderText('e.g. API_KEY');
    const titleInput = screen.getByPlaceholderText('e.g. API Key');
    const descTextarea = screen.getByPlaceholderText('e.g. Your API key for this service');
    expect(keyInput).toHaveAttribute('name', 'customUserVars.0.key');
    expect(titleInput).toHaveAttribute('name', 'customUserVars.0.title');
    expect(descTextarea).toHaveAttribute('name', 'customUserVars.0.description');
  });

  it('allows empty description (optional field)', () => {
    render(
      <Wrapper
        defaultValues={{
          customUserVars: [{ key: 'MY_KEY', title: 'My Key', description: '' }],
        }}
      />,
    );
    const descTextarea = screen.getByPlaceholderText(
      'e.g. Your API key for this service',
    ) as HTMLTextAreaElement;
    expect(descTextarea.value).toBe('');
  });
});

describe('CustomUserVarsDefinitionSection – removing entries', () => {
  it('renders a Delete button for each entry', () => {
    render(
      <Wrapper
        defaultValues={{
          customUserVars: [
            { key: 'A', title: 'Var A', description: '' },
            { key: 'B', title: 'Var B', description: '' },
          ],
        }}
      />,
    );
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(2);
  });

  it('removes an entry after clicking its Delete button', () => {
    render(
      <Wrapper
        defaultValues={{
          customUserVars: [
            { key: 'REMOVE_ME', title: 'Remove', description: '' },
            { key: 'KEEP_ME', title: 'Keep', description: '' },
          ],
        }}
      />,
    );
    expect(screen.getByText('Variable 2')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
    expect(screen.queryByText('Variable 2')).not.toBeInTheDocument();
    expect(screen.getByText('Variable 1')).toBeInTheDocument();
  });

  it('shows empty-state message after removing the last entry', () => {
    render(<Wrapper />);
    fireEvent.click(screen.getByRole('button', { name: /Add Variable/i }));
    expect(screen.queryByText('No user variables defined.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByText('No user variables defined.')).toBeInTheDocument();
  });
});

describe('CustomUserVarsDefinitionSection – key field', () => {
  it('renders the Key input with monospace class hint (font-mono via className)', () => {
    render(<Wrapper />);
    fireEvent.click(screen.getByRole('button', { name: /Add Variable/i }));
    const keyInput = screen.getByLabelText(/^Key/) as HTMLInputElement;
    expect(keyInput).toBeInTheDocument();
    expect(keyInput.className).toMatch(/font-mono/);
  });

  it('has the Key field placeholder text', () => {
    render(<Wrapper />);
    fireEvent.click(screen.getByRole('button', { name: /Add Variable/i }));
    expect(screen.getByPlaceholderText('e.g. API_KEY')).toBeInTheDocument();
  });

  it('marks Key as required with aria-hidden asterisk', () => {
    render(<Wrapper />);
    fireEvent.click(screen.getByRole('button', { name: /Add Variable/i }));
    // The asterisk is rendered as aria-hidden="true"
    const asterisks = document.querySelectorAll('[aria-hidden="true"]');
    const asterisk = Array.from(asterisks).find((el) => el.textContent === '*');
    expect(asterisk).toBeTruthy();
  });
});

describe('CustomUserVarsDefinitionSection – title (Label) field', () => {
  it('has the Label placeholder text', () => {
    render(<Wrapper />);
    fireEvent.click(screen.getByRole('button', { name: /Add Variable/i }));
    expect(screen.getByPlaceholderText('e.g. API Key')).toBeInTheDocument();
  });
});

describe('CustomUserVarsDefinitionSection – description field', () => {
  it('renders a textarea for the description', () => {
    render(<Wrapper />);
    fireEvent.click(screen.getByRole('button', { name: /Add Variable/i }));
    const textarea = screen.getByPlaceholderText('e.g. Your API key for this service');
    expect(textarea.tagName).toBe('TEXTAREA');
  });

  it('allows typing in the description textarea', () => {
    render(<Wrapper />);
    fireEvent.click(screen.getByRole('button', { name: /Add Variable/i }));
    const textarea = screen.getByPlaceholderText(
      'e.g. Your API key for this service',
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Some helpful description' } });
    expect(textarea.value).toBe('Some helpful description');
  });
});
