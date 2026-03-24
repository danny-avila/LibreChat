/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { useForm, FormProvider } from 'react-hook-form';
import AdvancedSection from '../sections/AdvancedSection';
import type { MCPServerFormData } from '../hooks/useMCPServerForm';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => {
    const t: Record<string, string> = {
      com_ui_mcp_chat_menu: 'Show in chat menu',
      com_ui_mcp_chat_menu_description: 'Display this server in the chat menu for quick access',
      com_ui_mcp_server_instructions: 'Server Instructions',
      com_ui_mcp_server_instructions_description:
        'Controls how server instructions are included in AI prompts',
      com_ui_mcp_server_instructions_none: 'None',
      com_ui_mcp_server_instructions_server: 'Use server-provided',
      com_ui_mcp_server_instructions_custom: 'Custom',
      com_ui_mcp_server_instructions_custom_placeholder:
        'Enter custom instructions for this server...',
      com_ui_no_options: 'No options',
    };
    return t[key] ?? key;
  },
}));

jest.mock('@librechat/client', () => {
  const ActualReact = jest.requireActual<typeof import('react')>('react');
  return {
    Checkbox: ({
      id,
      checked,
      onCheckedChange,
      ...rest
    }: {
      id?: string;
      checked: boolean;
      onCheckedChange: (v: boolean) => void;
      [key: string]: unknown;
    }) =>
      ActualReact.createElement('input', {
        id,
        type: 'checkbox',
        checked,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => onCheckedChange(e.target.checked),
        ...rest,
      }),
    Label: ({
      children,
      htmlFor,
      ...rest
    }: {
      children: React.ReactNode;
      htmlFor?: string;
      [key: string]: unknown;
    }) => ActualReact.createElement('label', { htmlFor, ...rest }, children),
    Radio: ({
      options,
      value,
      onChange,
    }: {
      options: Array<{ value: string; label: string }>;
      value: string;
      onChange: (v: string) => void;
      [key: string]: unknown;
    }) =>
      ActualReact.createElement(
        'div',
        { role: 'radiogroup' },
        options.map((opt) =>
          ActualReact.createElement(
            'button',
            {
              key: opt.value,
              type: 'button',
              role: 'radio',
              'aria-checked': value === opt.value,
              onClick: () => onChange(opt.value),
            },
            opt.label,
          ),
        ),
      ),
    Textarea: ActualReact.forwardRef<
      HTMLTextAreaElement,
      React.TextareaHTMLAttributes<HTMLTextAreaElement>
    >((props, ref) => ActualReact.createElement('textarea', { ref, ...props })),
  };
});

// ---------------------------------------------------------------------------
// Wrapper: provides a real react-hook-form context for the component under test
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
      <AdvancedSection />
    </FormProvider>
  );
}

// ---------------------------------------------------------------------------
// Tests: chatMenu checkbox
// ---------------------------------------------------------------------------

describe('AdvancedSection – chat menu checkbox', () => {
  it('renders the chat menu checkbox with correct label', () => {
    render(<Wrapper />);
    expect(screen.getByText('Show in chat menu')).toBeInTheDocument();
    expect(
      screen.getByText('Display this server in the chat menu for quick access'),
    ).toBeInTheDocument();
  });

  it('renders checkbox checked by default (chatMenu: true)', () => {
    render(<Wrapper defaultValues={{ chatMenu: true }} />);
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it('renders checkbox unchecked when chatMenu is false', () => {
    render(<Wrapper defaultValues={{ chatMenu: false }} />);
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });

  it('toggles the checkbox on click', () => {
    render(<Wrapper defaultValues={{ chatMenu: true }} />);
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    fireEvent.change(checkbox, { target: { checked: false } });
    expect(checkbox.checked).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: serverInstructions radio group
// ---------------------------------------------------------------------------

describe('AdvancedSection – server instructions radio', () => {
  it('renders the server instructions heading and description', () => {
    render(<Wrapper />);
    expect(screen.getByText('Server Instructions')).toBeInTheDocument();
    expect(
      screen.getByText('Controls how server instructions are included in AI prompts'),
    ).toBeInTheDocument();
  });

  it('renders all three radio options', () => {
    render(<Wrapper />);
    expect(screen.getByRole('radio', { name: 'None' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Use server-provided' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Custom' })).toBeInTheDocument();
  });

  it('has "None" selected by default', () => {
    render(<Wrapper />);
    const noneBtn = screen.getByRole('radio', { name: 'None' });
    expect(noneBtn).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Use server-provided' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(screen.getByRole('radio', { name: 'Custom' })).toHaveAttribute('aria-checked', 'false');
  });

  it('shows "Use server-provided" selected when mode is "server"', () => {
    render(<Wrapper defaultValues={{ serverInstructionsMode: 'server' }} />);
    expect(screen.getByRole('radio', { name: 'Use server-provided' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('shows "Custom" selected when mode is "custom"', () => {
    render(<Wrapper defaultValues={{ serverInstructionsMode: 'custom' }} />);
    expect(screen.getByRole('radio', { name: 'Custom' })).toHaveAttribute('aria-checked', 'true');
  });

  it('does not render the custom textarea when mode is "none"', () => {
    render(<Wrapper defaultValues={{ serverInstructionsMode: 'none' }} />);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('does not render the custom textarea when mode is "server"', () => {
    render(<Wrapper defaultValues={{ serverInstructionsMode: 'server' }} />);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('renders the custom textarea when mode is "custom"', () => {
    render(<Wrapper defaultValues={{ serverInstructionsMode: 'custom' }} />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveAttribute(
      'placeholder',
      'Enter custom instructions for this server...',
    );
  });

  it('populates custom textarea with existing text', () => {
    render(
      <Wrapper
        defaultValues={{
          serverInstructionsMode: 'custom',
          serverInstructionsCustom: 'Existing instructions.',
        }}
      />,
    );
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toBe('Existing instructions.');
  });

  it('switches from "none" to "server" when radio is clicked', () => {
    render(<Wrapper />);
    const serverBtn = screen.getByRole('radio', { name: 'Use server-provided' });
    fireEvent.click(serverBtn);
    expect(serverBtn).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('shows textarea after clicking the "Custom" radio', () => {
    render(<Wrapper />);
    const customBtn = screen.getByRole('radio', { name: 'Custom' });
    fireEvent.click(customBtn);
    expect(customBtn).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('hides textarea after switching away from "Custom"', () => {
    render(<Wrapper defaultValues={{ serverInstructionsMode: 'custom' }} />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'None' }));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
