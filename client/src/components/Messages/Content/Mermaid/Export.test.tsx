import React from 'react';
import userEvent from '@testing-library/user-event';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    await waitFor(() =>
      expect(mockDownloadMermaidSvg).toHaveBeenCalledWith(
        '<svg viewBox="0 0 400 200" />',
        'flow.mmd',
        'rgb(23 23 23)',
      ),
    );
    await waitFor(() => expect(trigger).toHaveFocus());

    await user.click(trigger);
    await user.click(await screen.findByRole('menuitem', { name: 'com_ui_export_png' }));
    await waitFor(() =>
      expect(mockDownloadMermaidPng).toHaveBeenCalledWith(
        '<svg viewBox="0 0 400 200" />',
        'flow.mmd',
        { width: 400, height: 200 },
        'rgb(23 23 23)',
      ),
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
    /* Opening from the keyboard focuses the menu itself; the items are reached
     * by the arrow keys, so drive the export the way a keyboard user does
     * rather than asserting the first item is focused on open. */
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(svgItem).toHaveFocus());
    await user.keyboard('{Enter}');

    await waitFor(() =>
      expect(mockDownloadMermaidSvg).toHaveBeenCalledWith(
        '<svg viewBox="0 0 400 200" />',
        'flow.mmd',
        'rgb(23 23 23)',
      ),
    );
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('turns the pressed format into its own loading row and blocks the other', async () => {
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
    await waitFor(() => expect(mockDownloadMermaidPng).toHaveBeenCalled());

    await user.click(trigger);
    const menu = within(screen.getByRole('menu'));
    /* The menu keeps exactly its two format rows: the pressed one becomes the
     * loading row in place, rather than a third status row appearing beside
     * two options that still look idle. */
    expect(menu.getAllByRole('menuitem')).toHaveLength(2);
    const running = menu.getByRole('menuitem', { name: 'com_ui_mermaid_exporting_png' });
    expect(running).toHaveTextContent('com_ui_loading');
    expect(running.querySelector('.lucide-loader-circle')).not.toBeNull();
    expect(running).toHaveAttribute('aria-disabled', 'true');
    expect(menu.queryByText('com_ui_export_png')).not.toBeInTheDocument();
    /* The other format cannot be started on top of the running one. */
    expect(menu.getByRole('menuitem', { name: 'com_ui_export_svg' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    await act(async () => finishExport?.());
    expect(screen.getByRole('status')).toHaveTextContent('com_ui_mermaid_export_complete');
    /* The menu is still open from the click above — the rows recover in place. */
    expect(menu.getByRole('menuitem', { name: 'com_ui_export_png' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('defers the synchronous SVG export until its loading row can paint', async () => {
    /* `downloadMermaidSvg` blocks the frame it runs in, so calling it straight
     * out of the click handler would freeze the open menu before the spinner
     * it is meant to show ever reached the screen. `fireEvent` is synchronous,
     * so nothing has had a chance to flush the deferral yet. */
    const user = userEvent.setup();
    render(<MermaidExport svg={'<svg viewBox="0 0 400 200" />'} filename="flow.mmd" />);

    const trigger = screen.getByRole('button', { name: 'com_ui_export_mermaid' });
    await user.click(trigger);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'com_ui_export_svg' }));

    expect(mockDownloadMermaidSvg).not.toHaveBeenCalled();
    expect(trigger).toHaveAttribute('aria-busy', 'true');
    await waitFor(() => expect(mockDownloadMermaidSvg).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(trigger).not.toHaveAttribute('aria-busy'));
  });

  it('saves the diagram source from the menu before any preview SVG exists', async () => {
    /* The source is the artifact's own content, so it is the one item that
     * never waits on a render — and the only enabled item on the code tab. */
    const user = userEvent.setup();
    const onDownloadSource = jest.fn().mockResolvedValue(true);
    render(<MermaidExport filename="flow.mmd" onDownloadSource={onDownloadSource} />);

    await user.click(screen.getByRole('button', { name: 'com_ui_export_mermaid' }));
    const sourceItem = await screen.findByRole('menuitem', {
      name: 'com_ui_export_mermaid_source',
    });
    expect(sourceItem).not.toHaveAttribute('aria-disabled', 'true');

    await user.click(sourceItem);
    await waitFor(() => expect(onDownloadSource).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('com_ui_mermaid_export_complete'),
    );
  });

  it('reports a failure when the source download delivers nothing', async () => {
    /* The stored file can be gone (expired code-output URL, deleted file):
     * the download helper reports that as `false` instead of throwing, and
     * announcing "export complete" over it would be a lie. */
    const user = userEvent.setup();
    const onDownloadSource = jest.fn().mockResolvedValue(false);
    render(<MermaidExport filename="flow.mmd" onDownloadSource={onDownloadSource} />);

    await user.click(screen.getByRole('button', { name: 'com_ui_export_mermaid' }));
    await user.click(await screen.findByRole('menuitem', { name: 'com_ui_export_mermaid_source' }));

    await waitFor(() => expect(onDownloadSource).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('com_ui_mermaid_export_failed'),
    );
    expect(mockShowToast).toHaveBeenCalledWith({
      status: 'error',
      message: 'com_ui_mermaid_export_failed',
    });
  });
});
