import DragDropOverlay from './Input/Files/DragDropOverlay';
import { useDragHelpers } from '~/hooks';

export default function Presentation({ children }: { children: React.ReactNode }) {
  const { isOver, canDrop, drop } = useDragHelpers();
  const isActive = canDrop && isOver;
  return (
    <div ref={drop} className="relative flex w-full grow overflow-hidden bg-white dark:bg-gray-800">
      <div className="transition-width relative flex h-full w-full flex-1 flex-col items-stretch overflow-hidden bg-white pt-0 dark:bg-gray-800">
        <div className="flex h-full flex-col" role="presentation" tabIndex={0}>
          {children}
          {isActive && <DragDropOverlay />}
        </div>
      </div>
    </div>
  );
}
