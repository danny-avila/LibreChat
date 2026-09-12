import React from 'react';
import userEvent from '@testing-library/user-event';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { downloadMermaidPng, downloadMermaidSvg } from '~/utils/diagram/export';
import MermaidExport from './Export';

const mockShowToast = jest.fn();

jest.mock('@librechat/client', () => ({
  ...jest.requireActual('@librechat/client'),
  useToastContext: () => ({ showToast: mockShowToast }),
}));

jest.mock('~/hooks', () => ({
  useLocalize:
    () =>
    (key: string): string =>
      key,
}));

jest.mock('~/utils/diagram/export', () => ({
  downloadMermaidPng: jest.fn(),
  downloadMermaidSvg: jest.fn(),
}));

const mockDownloadMermaidPng = jest.mocked(downloadMermaidPng);
const mockDownloadMermaidSvg = jest.mocked(downloadMermaidSvg);

describe('MermaidExport', () => {
  beforeEach(() => {
    document.documentElement.style.setProperty('--surface-primary-alt', '23 23 23');
    mockShowToast.mockReset();
    mockDownloadMermaidPng.mockResolvedValue();
    mockDownloadMermaidSvg.mockReset();
  });

  it('renders the menu inside the fullscreen element when one is given', async () => {
    const user = userEvent.setup();
    const fullscreenHost = document.createElement('div');
    document.body.appendChild(fullscreenHost);

    render(
      <MermaidExport
        svg={'<svg viewBox="0 0 400 200" />'}
        dimensions={{ width: 400, height: 200 }}
        filename="flow.mmd"
        portalElement={fullscreenHost}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'com_ui_export_mermaid' }));

    const menu = await screen.findByRole('menu');
    expect(fullscreenHost.contains(menu)).toBe(true);

    fullscreenHost.remove();
  });

  it('exports an already-rendered inline diagram as SVG and PNG', async () => {
    const user = userEvent.setup();
    render(
      <MermaidExport
        svg={'<svg viewBox="0 0 400 200" />'}
        dimensions={{ width: 400, height: 200 }}
        filename="flow.mmd"
      />,
    );

    const trigger = screen.getByRole('button', { name: 'com_ui_export_mermaid' });
    await user.click(trigger);
    expect(await screen.findByRole('menu')).toHaveClass('popover-ui');
    await user.click(await screen.findByRole('menuitem', { name: 'com_ui_export_svg' }));
    expect(mockDownloadMermaidSvg).toHaveBeenCalledWith(
      '<svg viewBox="0 0 400 200" />',
      'flow.mmd',
      'rgb(23 23 23)',
    );
    await waitFor(() => expect(trigger).toHaveFocus());

    await user.click(trigger);
    await user.click(await screen.findByRole('menuitem', { name: 'com_ui_export_png' }));
    expect(mockDownloadMermaidPng).toHaveBeenCalledWith(
      '<svg viewBox="0 0 400 200" />',
      'flow.mmd',
      { width: 400, height: 200 },
      'rgb(23 23 23)',
    );
  });

  it('keeps both formats disabled until an existing preview SVG is ready', async () => {
    const user = userEvent.setup();
    render(<MermaidExport filename="flow chart.mmd" />);

    await user.click(screen.getByRole('button', { name: 'com_ui_export_mermaid' }));

    expect(screen.getByRole('menuitem', { name: 'com_ui_export_svg' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('menuitem', { name: 'com_ui_export_png' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(mockDownloadMermaidSvg).not.toHaveBeenCalled();
    expect(mockDownloadMermaidPng).not.toHaveBeenCalled();
  });

  it('supports keyboard export and restores focus to its trigger', async () => {
    const user = userEvent.setup();
    render(<MermaidExport svg={'<svg viewBox="0 0 400 200" />'} filename="flow.mmd" />);

    await user.tab();
    const trigger = screen.getByRole('button', { name: 'com_ui_export_mermaid' });
    expect(trigger).toHaveFocus();

    await user.keyboard('{Enter}');
    const svgItem = await screen.findByRole('menuitem', { name: 'com_ui_export_svg' });
    expect(svgItem).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(mockDownloadMermaidSvg).toHaveBeenCalledWith(
      '<svg viewBox="0 0 400 200" />',
      'flow.mmd',
      'rgb(23 23 23)',
    );
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('announces PNG generation and prevents duplicate export actions', async () => {
    const user = userEvent.setup();
    let finishExport: (() => void) | undefined;
    mockDownloadMermaidPng.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishExport = resolve;
        }),
    );
    render(<MermaidExport svg={'<svg viewBox="0 0 400 200" />'} filename="flow.mmd" />);

    const trigger = screen.getByRole('button', { name: 'com_ui_export_mermaid' });
    await user.click(trigger);
    await user.click(await screen.findByRole('menuitem', { name: 'com_ui_export_png' }));

    expect(trigger).toHaveAttribute('aria-busy', 'true');
    expect(trigger.querySelector('.lucide-loader-circle')).not.toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('com_ui_mermaid_exporting_png');

    await user.click(trigger);
    expect(
      within(screen.getByRole('menu')).getByText('com_ui_mermaid_exporting_png'),
    ).toBeVisible();
    expect(screen.getByRole('menuitem', { name: 'com_ui_export_png' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    await act(async () => finishExport?.());
    expect(screen.getByRole('status')).toHaveTextContent('com_ui_mermaid_export_complete');
  });
});
