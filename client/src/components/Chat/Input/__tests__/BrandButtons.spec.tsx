import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { useForm } from 'react-hook-form';
import { render, screen } from '@testing-library/react';
import { brandConfigSchema } from 'librechat-data-provider';
import type { TStartupConfig, TBrandConfig } from 'librechat-data-provider';
import SendButton from '../SendButton';
import StopButton from '../StopButton';

let mockStartupConfig: Partial<TStartupConfig> | undefined;
jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({ data: mockStartupConfig }),
}));

jest.mock('~/hooks/useLocalize', () => ({
  __esModule: true,
  default:
    () =>
    (key: string): string =>
      key,
}));

function loadBrand(file: string): TBrandConfig {
  const raw = yaml.load(
    fs.readFileSync(path.resolve(__dirname, '../../../../brands', file), 'utf8'),
  );
  return brandConfigSchema.parse(raw);
}

function SendHarness() {
  const { control } = useForm<{ text: string }>({ defaultValues: { text: 'hello' } });
  return <SendButton control={control} disabled={false} />;
}

afterEach(() => {
  mockStartupConfig = undefined;
});

describe('SendButton brand wiring', () => {
  it('keeps native automation attributes when no brand is active', () => {
    mockStartupConfig = { appTitle: 'LibreChat' };
    render(<SendHarness />);
    const btn = screen.getByTestId('send-button');
    expect(btn).toHaveAttribute('id', 'send-button');
    expect(btn).toHaveAttribute('aria-label', 'com_nav_send_message');
  });

  it('overrides testid + aria-label from the gemini brand, keeps native id (null)', () => {
    mockStartupConfig = { brand: loadBrand('sim.yaml') };
    render(<SendHarness />);
    const btn = screen.getByTestId('send-button-container');
    expect(btn).toHaveAttribute('aria-label', 'Send message');
    expect(btn).toHaveAttribute('id', 'send-button');
    expect(screen.queryByTestId('send-button')).toBeNull();
  });
});

describe('StopButton brand wiring', () => {
  const noop = () => undefined;

  it('has no data-testid/id natively when no brand is active', () => {
    mockStartupConfig = { appTitle: 'LibreChat' };
    render(<StopButton stop={noop} setShowStopButton={noop} />);
    const btn = screen.getByRole('button', { name: 'com_nav_stop_generating' });
    expect(btn).not.toHaveAttribute('data-testid');
    expect(btn).not.toHaveAttribute('id');
  });

  it('adds testid + aria-label from the gemini brand (button swaps in place)', () => {
    mockStartupConfig = { brand: loadBrand('sim.yaml') };
    render(<StopButton stop={noop} setShowStopButton={noop} />);
    const btn = screen.getByTestId('send-button-container');
    expect(btn).toHaveAttribute('aria-label', 'Stop response');
  });
});
