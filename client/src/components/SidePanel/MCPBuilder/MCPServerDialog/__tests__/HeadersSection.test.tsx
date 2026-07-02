/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { useForm, FormProvider } from 'react-hook-form';
import HeadersSection from '../sections/HeadersSection';
import type { MCPServerFormData } from '../hooks/useMCPServerForm';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => {
    const t: Record<string, string> = {
      com_ui_mcp_headers: 'HTTP Headers',
      com_ui_mcp_add_header: 'Add Header',
      com_ui_mcp_no_headers: 'No headers configured.',
      com_ui_mcp_header_key: 'Header key',
      com_ui_mcp_header_key_placeholder: 'e.g. Authorization',
      com_ui_mcp_header_value: 'Header value',
      com_ui_mcp_header_value_placeholder: 'e.g. Bearer my-token',
      com_ui_mcp_header_value_secret_placeholder: '••••••••',
      com_ui_mcp_mark_secret: 'Mark as secret',
      com_ui_mcp_mark_not_secret: 'Mark as not secret',
      com_ui_mcp_insert_variable: 'Insert variable',
      com_ui_mcp_header_env_var_not_allowed: 'Environment variables are not allowed',
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
    SecretInput: ActualReact.forwardRef<
      HTMLInputElement,
      React.InputHTMLAttributes<HTMLInputElement>
    >((props, ref) =>
      ActualReact.createElement('input', {
        ref,
        type: 'password',
        'data-testid': 'secret-input',
        ...props,
      }),
    ),
    DropdownMenu: ({ children }: { children: React.ReactNode }) =>
      ActualReact.createElement('div', { 'data-testid': 'dropdown-menu' }, children),
    DropdownMenuTrigger: ({
      children,
      _asChild,
    }: {
      children: React.ReactNode;
      _asChild?: boolean;
    }) => ActualReact.createElement('div', { 'data-testid': 'dropdown-trigger' }, children),
    DropdownMenuContent: ({ children }: { children: React.ReactNode; [key: string]: unknown }) =>
      ActualReact.createElement('div', { 'data-testid': 'dropdown-content' }, children),
    DropdownMenuItem: ({
      children,
      onSelect,
    }: {
      children: React.ReactNode;
      onSelect?: () => void;
    }) =>
      ActualReact.createElement(
        'div',
        { 'data-testid': 'dropdown-item', onClick: onSelect, role: 'menuitem' },
        children,
      ),
  };
});

// lucide-react icons
jest.mock('lucide-react', () => ({
  Plus: () => null,
  Trash2: () => null,
  Lock: () => <span data-testid="lock-icon" />,
  LockOpen: () => <span data-testid="lock-open-icon" />,
  ChevronDown: () => null,
}));

// ---------------------------------------------------------------------------
// Wrapper
// ---------------------------------------------------------------------------

interface WrapperProps {
  defaultValues?: Partial<MCPServerFormData>;
  isEditMode?: boolean;
}

function Wrapper({ defaultValues = {}, isEditMode = false }: WrapperProps) {
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
      <HeadersSection isEditMode={isEditMode} />
    </FormProvider>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HeadersSection – empty state', () => {
  it('renders the section heading', () => {
    render(<Wrapper />);
    expect(screen.getByText('HTTP Headers')).toBeInTheDocument();
  });

  it('renders the "Add Header" button', () => {
    render(<Wrapper />);
    expect(screen.getByRole('button', { name: /Add Header/i })).toBeInTheDocument();
  });

  it('shows the empty-state message when no headers exist', () => {
    render(<Wrapper />);
    expect(screen.getByText('No headers configured.')).toBeInTheDocument();
  });

  it('does not render any header row inputs when empty', () => {
    render(<Wrapper />);
    expect(screen.queryByLabelText('Header key')).not.toBeInTheDocument();
  });
});

describe('HeadersSection – adding rows', () => {
  it('adds a row with key and value inputs after clicking "Add Header"', () => {
    render(<Wrapper />);
    fireEvent.click(screen.getByRole('button', { name: /Add Header/i }));
    expect(screen.getByLabelText('Header key')).toBeInTheDocument();
    expect(screen.getByLabelText('Header value')).toBeInTheDocument();
  });

  it('hides the empty-state message after adding a row', () => {
    render(<Wrapper />);
    fireEvent.click(screen.getByRole('button', { name: /Add Header/i }));
    expect(screen.queryByText('No headers configured.')).not.toBeInTheDocument();
  });

  it('adds multiple rows with separate inputs', () => {
    render(<Wrapper />);
    fireEvent.click(screen.getByRole('button', { name: /Add Header/i }));
    fireEvent.click(screen.getByRole('button', { name: /Add Header/i }));
    expect(screen.getAllByLabelText('Header key')).toHaveLength(2);
    expect(screen.getAllByLabelText('Header value')).toHaveLength(2);
  });
});

describe('HeadersSection – pre-populated rows', () => {
  it('renders rows for headers passed as defaultValues', () => {
    render(
      <Wrapper
        defaultValues={{
          headers: [
            { key: 'X-Custom', value: 'my-value', isSecret: false },
            { key: 'Authorization', value: '', isSecret: true },
          ],
        }}
      />,
    );
    const keyInputs = screen.getAllByLabelText('Header key');
    expect(keyInputs).toHaveLength(2);
    // Verify each input is registered under the correct field-array path.
    expect(keyInputs[0]).toHaveAttribute('name', 'headers.0.key');
    expect(keyInputs[1]).toHaveAttribute('name', 'headers.1.key');
  });
});

describe('HeadersSection – secret toggle', () => {
  it('renders the "Mark as secret" button (LockOpen icon) when isSecret is false', () => {
    render(
      <Wrapper defaultValues={{ headers: [{ key: 'X-Test', value: 'value', isSecret: false }] }} />,
    );
    expect(screen.getByRole('button', { name: 'Mark as secret' })).toBeInTheDocument();
    expect(screen.getByTestId('lock-open-icon')).toBeInTheDocument();
  });

  it('renders a plain text input for a non-secret header', () => {
    render(
      <Wrapper defaultValues={{ headers: [{ key: 'X-Public', value: 'pub', isSecret: false }] }} />,
    );
    const valueInput = screen.getByLabelText('Header value') as HTMLInputElement;
    expect(valueInput.type).not.toBe('password');
    expect(valueInput).not.toHaveAttribute('data-testid', 'secret-input');
  });

  it('renders the "Mark as not secret" button (Lock icon) after toggling to secret', () => {
    render(
      <Wrapper defaultValues={{ headers: [{ key: 'X-Test', value: '', isSecret: false }] }} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mark as secret' }));
    expect(screen.getByRole('button', { name: 'Mark as not secret' })).toBeInTheDocument();
    expect(screen.getByTestId('lock-icon')).toBeInTheDocument();
  });

  it('renders a password input (SecretInput) after toggling to secret', () => {
    render(
      <Wrapper defaultValues={{ headers: [{ key: 'X-Test', value: '', isSecret: false }] }} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mark as secret' }));
    expect(screen.getByTestId('secret-input')).toBeInTheDocument();
    const secretInput = screen.getByTestId('secret-input') as HTMLInputElement;
    expect(secretInput.type).toBe('password');
  });

  it('has aria-pressed="true" on the secret toggle after toggling to secret', () => {
    render(
      <Wrapper defaultValues={{ headers: [{ key: 'X-Test', value: '', isSecret: false }] }} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mark as secret' }));
    const btn = screen.getByRole('button', { name: 'Mark as not secret' });
    expect(btn).toHaveAttribute('aria-pressed', 'true');
  });

  it('has aria-pressed="false" on the secret toggle when isSecret is false', () => {
    render(
      <Wrapper defaultValues={{ headers: [{ key: 'X-Public', value: 'val', isSecret: false }] }} />,
    );
    const btn = screen.getByRole('button', { name: 'Mark as secret' });
    expect(btn).toHaveAttribute('aria-pressed', 'false');
  });

  it('switches to secret input after clicking the secret toggle', () => {
    render(
      <Wrapper defaultValues={{ headers: [{ key: 'X-Token', value: 'abc', isSecret: false }] }} />,
    );
    // Initially a regular input
    expect(screen.queryByTestId('secret-input')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mark as secret' }));
    // After toggle — now a password input
    expect(screen.getByTestId('secret-input')).toBeInTheDocument();
  });

  it('switches from secret back to plain input after clicking the toggle again', () => {
    render(
      <Wrapper
        defaultValues={{ headers: [{ key: 'Authorization', value: '', isSecret: true }] }}
      />,
    );
    expect(screen.getByTestId('secret-input')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mark as not secret' }));
    expect(screen.queryByTestId('secret-input')).not.toBeInTheDocument();
  });
});

describe('HeadersSection – removing rows', () => {
  it('renders a Delete button for each row', () => {
    render(
      <Wrapper
        defaultValues={{
          headers: [
            { key: 'X-A', value: 'a', isSecret: false },
            { key: 'X-B', value: 'b', isSecret: false },
          ],
        }}
      />,
    );
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(2);
  });

  it('removes the row after clicking Delete', () => {
    render(
      <Wrapper
        defaultValues={{
          headers: [
            { key: 'X-Remove', value: 'gone', isSecret: false },
            { key: 'X-Keep', value: 'stay', isSecret: false },
          ],
        }}
      />,
    );
    expect(screen.getAllByLabelText('Header key')).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
    expect(screen.getAllByLabelText('Header key')).toHaveLength(1);
  });

  it('shows empty-state message again after removing the last row', () => {
    render(<Wrapper />);
    fireEvent.click(screen.getByRole('button', { name: /Add Header/i }));
    expect(screen.queryByText('No headers configured.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByText('No headers configured.')).toBeInTheDocument();
  });
});

describe('HeadersSection – variable picker', () => {
  it('does not show variable picker for a non-secret header when no customUserVars exist', () => {
    render(
      <Wrapper
        defaultValues={{
          headers: [{ key: 'X-Test', value: '', isSecret: false }],
          customUserVars: [],
        }}
      />,
    );
    expect(screen.queryByLabelText('Insert variable')).not.toBeInTheDocument();
  });

  it('shows variable picker for a non-secret header when valid customUserVars exist', () => {
    render(
      <Wrapper
        defaultValues={{
          headers: [{ key: 'X-Index', value: '', isSecret: false }],
          customUserVars: [{ key: 'MY_VAR', title: 'My Variable', description: '' }],
        }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Insert variable' })).toBeInTheDocument();
  });

  it('does not show variable picker for a secret header even with customUserVars', () => {
    render(
      <Wrapper
        defaultValues={{
          headers: [{ key: 'X-Secret', value: '', isSecret: true }],
          customUserVars: [{ key: 'MY_VAR', title: 'My Variable', description: '' }],
        }}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Insert variable' })).not.toBeInTheDocument();
  });

  it('hides variable picker when customUserVar has no key or title (invalid entry)', () => {
    render(
      <Wrapper
        defaultValues={{
          headers: [{ key: 'X-Index', value: '', isSecret: false }],
          customUserVars: [{ key: '', title: '', description: '' }],
        }}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Insert variable' })).not.toBeInTheDocument();
  });
});
