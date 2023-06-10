import { TPlugin } from '~/data-provider';
import { XCircle, DownloadCloud } from 'lucide-react';

type TPluginStoreItemProps = {
  plugin: TPlugin;
  onInstall: () => void;
  onUninstall: () => void;
  isInstalled?: boolean;
};

function PluginStoreItem({ plugin, onInstall, onUninstall, isInstalled }: TPluginStoreItemProps) {
  const handleClick = () => {
    if (isInstalled) {
      onUninstall();
    } else {
      onInstall();
    }
  };

  return (
    <>
      <div className="flex flex-col gap-4 rounded border border-black/10 bg-white p-6 dark:border-white/20 dark:bg-gray-900">
        <div className="flex gap-4">
          <div className="h-[70px] w-[70px] shrink-0">
            <div className="relative h-full w-full">
              <img
                src={plugin.icon}
                alt={`${plugin.name} logo`}
                className="h-full w-full rounded-[5px] bg-white"
              />
              <div className="absolute inset-0 rounded-[5px] ring-1 ring-inset ring-black/10"></div>
            </div>
          </div>
          <div className="flex min-w-0 flex-col items-start justify-between">
            <div className="mb-2 line-clamp-1 max-w-full text-lg leading-5 text-gray-700/80 dark:text-gray-50">
              {plugin.name}
            </div>
            {!isInstalled ? (
              <button
                className="btn btn-primary relative"
                aria-label={`Install ${plugin.name}`}
                onClick={handleClick}
              >
                <div className="flex w-full items-center justify-center gap-2">
                  Install
                  <DownloadCloud className="flex h-4 w-4 items-center stroke-2" />
                </div>
              </button>
            ) : (
              <button
                className="btn relative bg-gray-300 hover:bg-gray-400 dark:bg-gray-50 dark:hover:bg-gray-200"
                onClick={handleClick}
                aria-label={`Uninstall ${plugin.name}`}
              >
                <div className="flex w-full items-center justify-center gap-2">
                  Uninstall
                  <XCircle className="flex h-4 w-4 items-center stroke-2" />
                </div>
              </button>
            )}
          </div>
        </div>
        <div className="line-clamp-3 h-[60px] text-sm text-slate-700/70 dark:text-slate-50/70">
          {plugin.description}
        </div>
      </div>
    </>
  );
}

export default PluginStoreItem;
