import { expect, test } from '@playwright/test';
import {
  MOCK_ENDPOINTS,
  NEW_CHAT_PATH,
  messagesView,
  selectMockEndpoint,
  sendMessageAndWaitForCompletion,
} from '../helpers';

const SHOWCASE_MARKER = 'E2E_ARTIFACT_SHOWCASE_REPLY';

test.describe('artifact trigger rows', () => {
  test(
    'showcase artifacts share one tool row axis ' +
      '@scenario:artifact-triggers-share-one-tool-row-axis',
    async ({ page }) => {
      await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
      await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);

      const response = await sendMessageAndWaitForCompletion(page, SHOWCASE_MARKER);
      expect(response.ok()).toBeTruthy();

      const messages = messagesView(page);
      const rows = messages.locator('[data-artifact-trigger]');
      await expect(rows).toHaveCount(5);

      for (let index = 0; index < (await rows.count()); index++) {
        const row = rows.nth(index);
        await row.scrollIntoViewIfNeeded();
        await expect(row).toBeVisible();
      }

      const boxes = await rows.evaluateAll((elements) =>
        elements.map((element) => {
          const box = element.getBoundingClientRect();
          return { x: box.x, y: box.y + window.scrollY };
        }),
      );
      expect(boxes).toHaveLength(5);
      for (let index = 1; index < boxes.length; index++) {
        expect(boxes[index].y).toBeGreaterThan(boxes[index - 1].y);
        expect(Math.abs(boxes[index].x - boxes[0].x)).toBeLessThanOrEqual(1);
      }

      const expectedRows = [
        ['dashboard.html', 'HTML'],
        ['ingest.py', 'python'],
        ['schema.sql', 'sql'],
        ['findings.md', 'Markdown'],
      ] as const;
      for (const [title, format] of expectedRows) {
        const row = rows.filter({ hasText: title });
        await expect(row).toHaveCount(1);
        await expect(row.getByText(format, { exact: true })).toBeVisible();
      }

      const mermaidRow = rows.filter({ hasText: 'Mermaid diagram' });
      await expect(mermaidRow).toHaveCount(1);
      await expect(mermaidRow.getByText('Diagram', { exact: true })).toBeVisible();
    },
  );

  test(
    'artifact rows announce preview or source honestly ' +
      '@scenario:artifact-row-announces-preview-or-source',
    async ({ page }) => {
      await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
      await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);

      const response = await sendMessageAndWaitForCompletion(page, SHOWCASE_MARKER);
      expect(response.ok()).toBeTruthy();

      const messages = messagesView(page);
      const rows = messages.locator('[data-artifact-trigger]');
      await expect(rows).toHaveCount(5);

      const dashboard = rows.filter({ hasText: 'dashboard.html' });
      await expect(dashboard).toHaveAccessibleName(
        /dashboard\.html.*HTML.*Opens as a rendered preview/,
      );

      const ingest = rows.filter({ hasText: 'ingest.py' });
      await expect(ingest).toHaveAccessibleName(/ingest\.py.*python.*Opens as source/);

      const findings = rows.filter({ hasText: 'findings.md' });
      await expect(findings).toHaveAccessibleName(
        /findings\.md.*Markdown.*Opens as a rendered preview/,
      );

      await ingest.click();
      await expect(ingest).toHaveAttribute('aria-expanded', 'true');
      await expect(ingest).toHaveAccessibleName(/Click to close/);

      const panel = page.locator('#artifact-viewer');
      await expect(panel).toBeVisible();
      await expect(panel).toHaveAttribute('aria-label', 'ingest.py');
      await expect(panel.getByRole('radio', { name: 'Preview', exact: true })).toHaveCount(0);
      const width = page.viewportSize()?.width ?? 0;
      if (width >= 869) {
        await expect(panel.getByRole('radio')).toHaveCount(1);
        await expect(panel.getByRole('radio', { name: 'ingest.py', exact: true })).toBeVisible();
      }
    },
  );
});
