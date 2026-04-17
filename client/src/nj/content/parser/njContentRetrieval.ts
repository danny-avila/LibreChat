import updateWidget from '~/nj/content/update-widget.md?raw';

export type UpdateWidgetContent = {
  date: Date;
  title: string;
  description: string;
  linkText: string;
  linkUrl: string;
};

export function getUpdateWidgetContent(source: string = updateWidget): UpdateWidgetContent {
  const sections = source
    .split(/\n?#[^\n]+\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    date: new Date(sections[0]),
    title: sections[1],
    description: sections[2],
    linkText: sections[3],
    linkUrl: sections[4],
  };
}
