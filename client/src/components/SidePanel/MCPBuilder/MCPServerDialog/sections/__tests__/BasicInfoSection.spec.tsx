import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FormProvider, useForm } from 'react-hook-form';
import { MAX_MCP_ICON_PATH_LENGTH } from 'librechat-data-provider';
import type * as ReactNS from 'react';
import type { ReactNode } from 'react';
import type { MCPServerFormData } from '../../hooks/useMCPServerForm';
import BasicInfoSection from '../BasicInfoSection';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${values[0]}` : key,
}));

jest.mock('~/components/ui/CustomIcon', () => {
  const React = jest.requireActual<typeof ReactNS>('react');
  return {
    __esModule: true,
    default: ({ src }: { src: string }) =>
      React.createElement('img', { alt: '', 'data-testid': 'icon-preview', src }),
  };
});

jest.mock('@librechat/client', () => {
  const React = jest.requireActual<typeof ReactNS>('react');
  return {
    Button: ({ children, ...props }: { children: ReactNode }) =>
      React.createElement('button', { type: 'button', ...props }, children),
    /* `register(...)` hands each field a ref, so the stand-ins must forward it. */
    Input: React.forwardRef<HTMLInputElement, Record<string, unknown>>((props, ref) =>
      React.createElement('input', { ...props, ref }),
    ),
    Label: ({ children, ...props }: { children: ReactNode }) =>
      React.createElement('label', props, children),
    Textarea: React.forwardRef<HTMLTextAreaElement, Record<string, unknown>>((props, ref) =>
      React.createElement('textarea', { ...props, ref }),
    ),
    SquirclePlusIcon: () => React.createElement('span'),
  };
});

function renderSection() {
  function Wrapper() {
    const methods = useForm<MCPServerFormData>({
      defaultValues: {
        title: '',
        description: '',
        icon: '',
        url: '',
        type: 'streamable-http',
        auth: { auth_type: 'none' as MCPServerFormData['auth']['auth_type'] },
        trust: false,
      },
    });
    return (
      <FormProvider {...methods}>
        <BasicInfoSection />
      </FormProvider>
    );
  }

  const view = render(<Wrapper />);
  const input = view.container.querySelector<HTMLInputElement>('input[type="file"]');
  if (input == null) {
    throw new Error('icon file input not rendered');
  }
  return { ...view, input };
}

/** A raster file whose base64 data URI lands either side of the stored-icon cap. */
function rasterFile(bytes: number): File {
  return new File([new Uint8Array(bytes)], 'icon.png', { type: 'image/png' });
}

describe('BasicInfoSection icon upload', () => {
  it('rejects a file too large to store and explains why', async () => {
    const { input } = renderSection();

    fireEvent.change(input, { target: { files: [rasterFile(MAX_MCP_ICON_PATH_LENGTH)] } });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('com_ui_icon_too_large:192');
    expect(screen.queryByTestId('icon-preview')).not.toBeInTheDocument();
  });

  it('describes the upload control with the rejection so it is announced', async () => {
    const { input } = renderSection();

    fireEvent.change(input, { target: { files: [rasterFile(MAX_MCP_ICON_PATH_LENGTH)] } });

    const alert = await screen.findByRole('alert');
    const button = screen.getByRole('button', { name: 'com_ui_upload_icon' });
    expect(button).toHaveAttribute('aria-describedby', alert.id);
    expect(button).toHaveAttribute('aria-invalid', 'true');
  });

  it('accepts a file that fits and previews it without an error', async () => {
    const { input } = renderSection();

    fireEvent.change(input, { target: { files: [rasterFile(1024)] } });

    await waitFor(() => {
      expect(screen.getByTestId('icon-preview')).toHaveAttribute(
        'src',
        expect.stringContaining('data:image/png;base64,'),
      );
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('clears a previous rejection once an acceptable file is picked', async () => {
    const { input } = renderSection();

    fireEvent.change(input, { target: { files: [rasterFile(MAX_MCP_ICON_PATH_LENGTH)] } });
    await screen.findByRole('alert');

    fireEvent.change(input, { target: { files: [rasterFile(1024)] } });

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('icon-preview')).toBeInTheDocument();
  });
});
