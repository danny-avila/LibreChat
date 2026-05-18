import type { TFile } from 'librechat-data-provider';

type FileGrouping = {
  [key in 'pinned' | 'today' | 'yesterday' | 'previous']: TFile[];
};

function toLocalDateString(date: Date, timeZone: string): string {
  return date.toLocaleDateString(undefined, { timeZone });
}

function sortByField(files: TFile[], fieldName: string) {
  files.sort((a, b) => {
    const aTime = a[fieldName] ? new Date(a[fieldName]).getTime() : 0;
    const bTime = b[fieldName] ? new Date(b[fieldName]).getTime() : 0;
    return bTime - aTime;
  });
}

export function groupFiles(
  files: TFile[],
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): FileGrouping {
  const now = new Date();
  const todayStr = toLocalDateString(now, timeZone);

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = toLocalDateString(yesterday, timeZone);

  const result: FileGrouping = { pinned: [], today: [], yesterday: [], previous: [] };

  for (const file of files) {
    if (file.pinned) {
      result.pinned.push(file);
      continue;
    }

    const created = file.createdAt ? new Date(file.createdAt) : null;
    const dateStr = created ? toLocalDateString(created, timeZone) : null;
    if (dateStr === todayStr) {
      result.today.push(file);
    } else if (dateStr === yesterdayStr) {
      result.yesterday.push(file);
    } else {
      result.previous.push(file);
    }
  }

  sortByField(result.pinned, 'updatedAt');
  sortByField(result.today, 'createdAt');
  sortByField(result.yesterday, 'createdAt');
  sortByField(result.previous, 'createdAt');

  return result;
}
