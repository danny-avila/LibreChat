type TPluginStoreItemProps = {
  name: string,
  description: string,
  imageSource: string,
  onInstall: () => void
  onUninstall: () => void
  isInstalled?: boolean,
}

function PluginStoreItem({ name, description, imageSource, onInstall, onUninstall, isInstalled }: TPluginStoreItemProps) {

  const handleClick = () => {
    if (isInstalled) {
      onUninstall();
    } else {
      onInstall();
    }
  }
  
  return (
    <>
      <div className="flex flex-col gap-4 rounded border border-black/10 bg-white p-6 dark:border-white/20 dark:bg-gray-900">
        <div className="flex gap-4">
        <div className="h-[70px] w-[70px] shrink-0">
          <div className="relative h-full w-full">
            <img
              src={imageSource}
              alt={`${name} logo`}
              className="h-full w-full rounded-[5px] bg-white"
            />
            <div className="absolute inset-0 rounded-[5px] ring-1 ring-inset ring-black/10"></div>
          </div>
        </div>
        <div className="flex min-w-0 flex-col items-start justify-between">
          <div className="line-clamp-1 max-w-full text-lg leading-5 text-white">
            {name}
          </div>
          <button className="btn btn-primary relative" onClick={handleClick}>
            <div className="flex w-full items-center justify-center gap-2">
              {isInstalled ? 'Uninstall' : 'Install'}
              <svg
                stroke="currentColor"
                fill="none"
                strokeWidth="2"
                viewBox="0 0 24 24"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
                height="1em"
                width="1em"
                xmlns="http://www.w3.org/2000/svg"
              >
                <polyline points="8 17 12 21 16 17"></polyline>
                <line
                  x1="12"
                  y1="12"
                  x2="12"
                  y2="21"
                ></line>
                <path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"></path>
              </svg>
            </div>
          </button>
        </div>
      </div>
      <div className="line-clamp-3 h-[60px] text-sm text-black/70 dark:text-white/70">
        {description}
      </div>
    </div>
  </>
  )
}

export default PluginStoreItem;