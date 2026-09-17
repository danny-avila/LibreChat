import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { getE2EUser } from '../../../setup/user';
import {
  deleteConversations,
  deleteMessagesByConversation,
  seedConversations,
  seedMessages,
} from '../db';
import { messagesView } from '../helpers';
import {
  computedStyles,
  normalizeColor,
  probePlaceholderColor,
  probeStyle,
  themeValue,
  useStoredTheme,
} from './style.helpers';
import type { Page } from '@playwright/test';
import type { SeedMessage } from '../db';

/**
 * The Tailwind v4 upgrade is meant to be visually invisible, and three of its
 * renamings decide whether it is: v4 moved the blur scale up a step, it defaults
 * `border-color` to `currentColor` where v3 used gray-200, and it defaults a
 * placeholder to the field's own colour at half opacity. Each scenario reads what
 * the app paints and compares it to a probe painted by the same stylesheet, so
 * the assertion survives a theme, a mode and the token move in the next commit.
 */

const ROOT_PARENT = '00000000-0000-0000-0000-000000000000';
const ARTIFACT_TEXT = [
  ':::artifact{identifier="e2e-v4-panel" type="application/vnd.code" title="panel.py"}',
  '```python',
  'print("panel")',
  '```',
  ':::',
].join('\n');

/** Seed one assistant turn carrying an artifact and open its panel. */
async function openArtifactPanel(page: Page, conversationId: string): Promise<void> {
  const message: SeedMessage = {
    messageId: randomUUID(),
    parentMessageId: ROOT_PARENT,
    text: ARTIFACT_TEXT,
    isCreatedByUser: false,
    sender: 'Assistant',
    model: 'mock-model-a',
  };
  await seedConversations(getE2EUser().email, [
    { conversationId, title: 'Tailwind v4 rendering', updatedAt: new Date() },
  ]);
  await seedMessages(getE2EUser().email, conversationId, [message]);
  await page.goto(`/c/${conversationId}`, { timeout: 30000 });

  const trigger = messagesView(page).locator('[data-artifact-trigger]').first();
  await expect(trigger).toBeVisible({ timeout: 30000 });
  await trigger.click();
  await expect(page.locator('#artifact-viewer')).toBeVisible({ timeout: 30000 });
}

test.describe('Tailwind v4 rendering', () => {
  /** The artifact panel and its resize handle are desktop surfaces: the side
   *  panel group does not mount below `md`, so the scenarios that read them
   *  declare the viewport they describe instead of inheriting a phone. */
  test.use({ viewport: { width: 1280, height: 900 } });

  test('a small blur surface still blurs by four pixels @scenario:a-small-blur-surface-still-blurs-by-four-pixels', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const conversationId = randomUUID();
    try {
      await openArtifactPanel(page, conversationId);

      /** The artifact panel's refresh scrim stands in for the six small-blur
       *  sites the upgrade touched: v3's `blur-sm` was 4px, v4's is 8px, and the
       *  4px step is now called `blur-xs`. The scrim is always mounted, so its
       *  filter is readable while it is still transparent. */
      const scrim = page.locator('#artifact-viewer [role="status"]').first();
      await expect(scrim).toBeAttached({ timeout: 30000 });

      const { backdropFilter } = await computedStyles(scrim, ['backdropFilter']);
      expect(backdropFilter).toBe('blur(4px)');
      expect(backdropFilter).not.toBe('blur(8px)');
    } finally {
      await deleteMessagesByConversation([conversationId]);
      await deleteConversations([conversationId]);
    }
  });

  test('the resize handle border follows the theme @scenario:the-resize-handle-border-follows-the-theme', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const conversationId = randomUUID();
    /** Dark mode is what separates the two candidates: the app's compatibility
     *  shim paints a fixed light gray, while the semantic role follows the
     *  theme — and only the role ships with the package. */
    await useStoredTheme(page, 'dark');
    try {
      await openArtifactPanel(page, conversationId);
      await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/);

      /** The panel-group separator, not the sidebar's resize strip: only this
       *  one carries the grip whose border is under test. */
      const grip = page.locator('[role="separator"] > div').first();
      await expect(grip).toBeAttached({ timeout: 30000 });

      const { borderTopColor, color } = await computedStyles(grip, ['borderTopColor', 'color']);
      const expected = await normalizeColor(
        page,
        `rgb(${await themeValue(page, '--border-light')})`,
      );
      expect(borderTopColor).toBe(expected);
      /** A bare `border` under v4 inherits `currentColor`, which is what the
       *  published primitive drew before it named a role. */
      expect(borderTopColor).not.toBe(color);
    } finally {
      await deleteMessagesByConversation([conversationId]);
      await deleteConversations([conversationId]);
    }
  });

  test('the app keeps its v3 border and placeholder defaults @scenario:the-app-keeps-its-v3-border-and-placeholder-defaults', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto('/c/new', { timeout: 30000 });

    const composer = page.getByRole('textbox', { name: 'Message input' });
    await expect(composer).toBeVisible({ timeout: 30000 });

    /** v4's preflight would paint an uncoloured border with `currentColor`. The
     *  app restores v3's gray-200 through `theme()`, so a bare `border` has to
     *  match what the `border-gray-200` utility paints out of the same CSS. */
    const bare = await probeStyle(page, 'border', 'border-top-color');
    const gray200 = await probeStyle(page, 'border border-gray-200', 'border-top-color');
    const inherited = await probeStyle(page, 'border', 'color');
    expect(bare).toBe(gray200);
    expect(bare).not.toBe(inherited);

    /** And v4 would paint a placeholder as the field's own colour at half
     *  opacity. The app restores gray-400, which `text-gray-400` paints from the
     *  same CSS. The composer sets its own `placeholder:` role, so the probe is
     *  a plain field — which is what the preflight rule governs. */
    const placeholder = await probePlaceholderColor(page);
    const gray400 = await probeStyle(page, 'text-gray-400', 'color');
    const body = await probeStyle(page, '', 'color');
    expect(placeholder).toBe(gray400);
    expect(placeholder).not.toBe(body);

    /** And v4 drops `cursor: pointer` from buttons, which the app restores in
     *  `@layer base`. The layer is the point: a `cursor-*` utility has to keep
     *  winning, or `disabled:cursor-not-allowed` on a disabled control and
     *  `cursor-default` on a menu trigger would both read as a pointer. */
    const button = await probeStyle(page, '', 'cursor', 'button');
    const overridden = await probeStyle(page, 'cursor-default', 'cursor', 'button');
    expect(button).toBe('pointer');
    expect(overridden).toBe('default');
  });
});
