import { useMemo } from 'react';
import type { TFile } from 'librechat-data-provider';
import useAttachExisting from '~/hooks/Files/useAttachExisting';
import { useGetFiles } from '~/data-provider';

/**
 * The user's uploaded files, newest first, for attaching one to the next
 * message without uploading it again.
 *
 * Fetched only while the palette is open: this is the whole file list, and no
 * other part of the composer needs it.
 */
export default function useRecentFiles(enabled: boolean): {
  files: TFile[];
  attach: (file: TFile) => void;
} {
  const { data } = useGetFiles<TFile[]>({ enabled });
  const attach = useAttachExisting();

  const files = useMemo(() => {
    if (!data?.length) {
      return [];
    }
    const stamp = (file: TFile) => new Date(file.updatedAt ?? file.createdAt ?? 0).getTime();
    return [...data].sort((a, b) => stamp(b) - stamp(a));
  }, [data]);

  return { files, attach };
}
