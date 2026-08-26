import React from 'react';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { TFile } from 'librechat-data-provider';
import FileContainer from '../FileContainer';

jest.mock('~/utils', () => ({
  cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' '),
  getFileType: () => ({ paths: [], color: '', title: 'Plain' }),
}));

jest.mock('../FilePreview', () => ({
  __esModule: true,
  default: () => <div data-testid="file-preview" />,
}));

jest.mock('../RemoveFile', () => ({
  __esModule: true,
  default: () => <button data-testid="remove-file" />,
}));

const baseFile = (overrides: Partial<TFile> = {}): Partial<TFile> => ({
  file_id: 'f1',
  filename: 'report.pdf',
  type: 'application/pdf',
  ...overrides,
});

describe('FileContainer chip label', () => {
  it('shows the raw filename when no `displayName` is supplied (upload context)', () => {
    /** A user-uploaded file whose name happens to look like the
     * code-execution collision suffix (`-<6 hex>` before extension) must
     * not have its name silently rewritten — historically a global
     * `displayFilename(file.filename)` call here would strip the suffix
     * and turn `report-abc123.pdf` into `report.pdf`. Stripping is now
     * opt-in via `displayName`, so upload chips show the raw name. */
    render(<FileContainer file={baseFile({ filename: 'report-abc123.pdf' })} />);
    expect(screen.getByText('report-abc123.pdf')).toBeInTheDocument();
  });

  it('uses `displayName` when supplied (artifact context opts in)', () => {
    render(
      <FileContainer
        file={baseFile({ filename: 'archive-deadbe.zip', type: 'application/zip' })}
        displayName="archive.zip"
      />,
    );
    expect(screen.getByText('archive.zip')).toBeInTheDocument();
    expect(screen.queryByText(/-deadbe/)).not.toBeInTheDocument();
  });

  it('falls back to empty string when neither `displayName` nor `filename` is set', () => {
    const { container } = render(<FileContainer file={{ file_id: 'noname' } as Partial<TFile>} />);
    /** Title element exists but is empty — no crash, no `undefined`. */
    expect(container.querySelector('.font-medium')?.textContent).toBe('');
  });
});

describe('FileContainer subtitle action', () => {
  const subtitleAction = (onClick = jest.fn()) => ({ label: 'Move back into message', onClick });

  it('shows the file type until the chip is hovered', () => {
    render(
      <FileContainer file={baseFile()} onClick={jest.fn()} subtitleAction={subtitleAction()} />,
    );

    /** Both labels are in the DOM; which one shows is a `group-hover` swap CSS owns. */
    expect(screen.getByText('Plain')).toBeInTheDocument();
    expect(screen.getByText('Move back into message')).toBeInTheDocument();
  });

  it('names the subtitle control for screen readers regardless of the visible label', () => {
    render(
      <FileContainer file={baseFile()} onClick={jest.fn()} subtitleAction={subtitleAction()} />,
    );

    const control = screen.getByRole('button', { name: 'Move back into message' });
    expect(control).toBeInTheDocument();
    /** The swapped spans are decorative; the accessible name comes from the label. */
    expect(screen.getByText('Plain')).toHaveAttribute('aria-hidden', 'true');
  });

  it('runs the subtitle action without also opening the chip', async () => {
    const onClick = jest.fn();
    const onSubtitleClick = jest.fn();
    render(
      <FileContainer
        file={baseFile()}
        onClick={onClick}
        ariaLabel="Edit pasted text"
        subtitleAction={subtitleAction(onSubtitleClick)}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Move back into message' }));

    expect(onSubtitleClick).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('keeps the chip itself clickable alongside the subtitle control', async () => {
    const onClick = jest.fn();
    render(
      <FileContainer
        file={baseFile()}
        onClick={onClick}
        ariaLabel="Edit pasted text"
        subtitleAction={subtitleAction()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Edit pasted text' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('never nests the subtitle control inside the chip control', () => {
    const { container } = render(
      <FileContainer file={baseFile()} onClick={jest.fn()} subtitleAction={subtitleAction()} />,
    );

    /** A button inside a button is invalid markup and browsers drop the inner one's events. */
    expect(container.querySelector('button button')).toBeNull();
  });

  it('reveals the action from the whole chip rather than the label alone', () => {
    render(
      <FileContainer file={baseFile()} onClick={jest.fn()} subtitleAction={subtitleAction()} />,
    );

    /** The swap keys off the chip's own `group`, so pointing anywhere on the chip offers it. */
    const resting = screen.getByText('Plain');
    const revealed = screen.getByText('Move back into message');
    expect(resting.className).toContain('group-hover:hidden');
    expect(revealed.className).toContain('group-hover:inline');
    expect(`${resting.className} ${revealed.className}`).not.toContain('group-hover/');
  });

  it('reveals the action for keyboard users too', () => {
    render(
      <FileContainer file={baseFile()} onClick={jest.fn()} subtitleAction={subtitleAction()} />,
    );

    expect(screen.getByText('Plain').className).toContain('group-focus-within:hidden');
    expect(screen.getByText('Move back into message').className).toContain(
      'group-focus-within:inline',
    );
  });

  it('keeps the action revealed on devices with no hover to reveal it', () => {
    render(
      <FileContainer file={baseFile()} onClick={jest.fn()} subtitleAction={subtitleAction()} />,
    );

    /** Touch has no hover or focus to announce the swap with, so the label itself must show:
     * an inert-looking "Plain Text" subtitle that detaches on tap is a trap, not an affordance. */
    expect(screen.getByText('Plain').className).toContain('[@media(hover:none)]:hidden');
    expect(screen.getByText('Move back into message').className).toContain(
      '[@media(hover:none)]:inline',
    );
  });

  it('keeps the full-chip focus indicator inside the clipped surface', () => {
    render(
      <FileContainer file={baseFile()} onClick={jest.fn()} subtitleAction={subtitleAction()} />,
    );

    /** The surface applies `overflow-hidden`, so an offset ring on the full-bleed button would
     * be clipped away entirely; the treatment draws inside the target instead. */
    const chipControl = screen.getByRole('button', { name: 'report.pdf' });
    expect(chipControl.className).toContain('focus-visible:ring-inset');
    expect(chipControl.className).not.toContain('ring-offset');
  });

  it('styles the action exactly like the subtitle it replaces', () => {
    render(
      <FileContainer file={baseFile()} onClick={jest.fn()} subtitleAction={subtitleAction()} />,
    );

    const control = screen.getByRole('button', { name: 'Move back into message' });
    expect(control.className).toContain('text-text-secondary');
    /** No colour of its own: it should read as the subtitle, not as a link. */
    expect(control.className).not.toContain('hover:text-text-primary');
  });

  it('underlines the action once the pointer is on the label itself', () => {
    render(
      <FileContainer file={baseFile()} onClick={jest.fn()} subtitleAction={subtitleAction()} />,
    );

    /** Keyed to the control's own hover, not the chip's, so the underline only shows up
     * under a pointer that is actually on the label. */
    const control = screen.getByRole('button', { name: 'Move back into message' });
    expect(control.className).toContain('hover:underline');
    expect(control.className).not.toContain('group-hover:underline');
  });

  it('leaves the plain subtitle alone when no action is offered', () => {
    render(<FileContainer file={baseFile()} onClick={jest.fn()} />);

    expect(screen.getByText('Plain')).toBeInTheDocument();
    expect(screen.queryByText('Move back into message')).not.toBeInTheDocument();
  });
});
