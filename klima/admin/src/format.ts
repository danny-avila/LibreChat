const timestamp = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });

export const formatTimestamp = (iso?: string): string => {
  if (!iso) {
    return 'Never';
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return iso;
  }
  return timestamp.format(parsed);
};
