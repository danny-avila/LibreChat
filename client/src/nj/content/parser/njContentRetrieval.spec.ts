import updateWidget from '~/nj/content/update-widget.md?raw';
import { getUpdateWidgetContent } from './njContentRetrieval';

const HARDCODED = `# Date

4/16/2026

# Title

My Title

# Description

My description text.

# Link Text

My link text`;

describe('getUpdateWidgetContent', () => {
  describe('parsing basics', () => {
    it('parses the date', () => {
      const { date } = getUpdateWidgetContent(HARDCODED);
      expect(date).toEqual(new Date('4/16/2026'));
    });

    it('parses the title', () => {
      const { title } = getUpdateWidgetContent(HARDCODED);
      expect(title).toBe('My Title');
    });

    it('parses the description', () => {
      const { description } = getUpdateWidgetContent(HARDCODED);
      expect(description).toBe('My description text.');
    });

    it('parses the link text', () => {
      const { linkText } = getUpdateWidgetContent(HARDCODED);
      expect(linkText).toBe('My link text');
    });
  });

  describe('update-widget.md validity', () => {
    it('parses a valid date', () => {
      const { date } = getUpdateWidgetContent(updateWidget);
      expect(date).toBeInstanceOf(Date);
      expect(date.getTime()).not.toBeNaN();
    });

    it('parses a non-empty title', () => {
      const { title } = getUpdateWidgetContent(updateWidget);
      expect(title.length).toBeGreaterThan(0);
    });

    it('parses a non-empty description', () => {
      const { description } = getUpdateWidgetContent(updateWidget);
      expect(description.length).toBeGreaterThan(0);
    });

    it('parses a non-empty link text', () => {
      const { linkText } = getUpdateWidgetContent(updateWidget);
      expect(linkText.length).toBeGreaterThan(0);
    });
  });
});
