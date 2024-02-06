import React from 'react';
import { axe } from 'jest-axe';
import { RenderResult } from '@testing-library/react';
import { render, fireEvent } from '@testing-library/react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';

const OPEN_TEXT = 'Open';
const CANCEL_TEXT = 'Cancel';
const ACTION_TEXT = 'Do it';
const TITLE_TEXT = 'Warning';
const DESC_TEXT = 'This is a warning';
const OVERLAY_TEST_ID = 'test-overlay';

const DialogTest = (props: React.ComponentProps<typeof AlertDialog.Root>) => (
  <AlertDialog.Root {...props}>
    <AlertDialog.Trigger>{OPEN_TEXT}</AlertDialog.Trigger>
    <AlertDialog.Overlay data-testid={OVERLAY_TEST_ID} />
    <AlertDialog.Content>
      <AlertDialog.Title>{TITLE_TEXT}</AlertDialog.Title>
      <AlertDialog.Description>{DESC_TEXT}</AlertDialog.Description>
      <AlertDialog.Cancel>{CANCEL_TEXT}</AlertDialog.Cancel>
      <AlertDialog.Action>{ACTION_TEXT}</AlertDialog.Action>
    </AlertDialog.Content>
  </AlertDialog.Root>
);

describe('given a default Dialog', () => {
  let rendered: RenderResult;
  let title: HTMLElement;
  let trigger: HTMLElement;
  let cancelButton: HTMLElement;

  beforeEach(() => {
    rendered = render(<DialogTest />);
    trigger = rendered.getByText(OPEN_TEXT);
  });

  it('should have no accessibility violations in default state', async () => {
    expect(await axe(rendered.container)).toHaveNoViolations();
  });

  describe('after clicking the trigger', () => {
    beforeEach(() => {
      fireEvent.click(trigger);
      title = rendered.getByText(TITLE_TEXT);
      cancelButton = rendered.getByText(CANCEL_TEXT);
    });

    it('should open the content', () => {
      expect(title).toBeVisible();
    });

    it('should have no accessibility violations when open', async () => {
      expect(await axe(rendered.container)).toHaveNoViolations();
    });

    it('should focus the cancel button', () => {
      expect(cancelButton).toHaveFocus();
    });
  });
});
