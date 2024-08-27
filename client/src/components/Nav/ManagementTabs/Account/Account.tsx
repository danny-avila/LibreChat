
import type { TFile } from 'librechat-data-provider';
import { cn } from '~/utils/';
import { useMediaQuery } from '~/hooks';
import { useGetFiles } from '~/data-provider';
export default function Account() {

  const { data: files = [] } = useGetFiles<TFile[]>({
    select: (files) =>
      files.map((file) => {
        file.context = file.context ?? FileContext.unknown;
        file.filterSource = file.source === FileSources.firebase ? FileSources.local : file.source;
        return file;
      }),
  });

  console.log('account');
  return (
    <div>
      用户管理页面
    </div>
  );
}
