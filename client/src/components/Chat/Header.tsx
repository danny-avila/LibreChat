import { EndpointsMenu, PresetsMenu } from './Menus';
import HeaderOptions from './Input/HeaderOptions';

export default function Header() {
  return (
    <div className="sticky top-0 z-10 flex h-14 w-full items-center justify-between bg-white/95 p-2 font-semibold dark:bg-gray-800/90 dark:text-white">
      <div className="flex items-center gap-2 overflow-x-auto">
        <EndpointsMenu />
        <HeaderOptions />
        <PresetsMenu />
      </div>
      {/* Empty div for spacing */}
      <div />
    </div>
  );
}
