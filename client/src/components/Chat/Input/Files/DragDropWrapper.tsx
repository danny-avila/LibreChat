import { useDragHelpers } from '~/hooks';
import DragDropOverlay from '~/components/Chat/Input/Files/DragDropOverlay';
import DragDropModal from '~/components/Chat/Input/Files/DragDropModal';
import { DragDropProvider } from '~/Providers';
import { cn } from '~/utils';

interface DragDropWrapperProps {
  children: React.ReactNode;
  className?: string;
}

export default function DragDropWrapper({ children, className }: DragDropWrapperProps) {
  const { isOver, canDrop, drop, showModal, setShowModal, draggedFiles, handleOptionSelect } =
    useDragHelpers();

  const isActive = canDrop && isOver;

  return (
    <div ref={drop} className={cn('relative flex h-full w-full', className)}>
      {children}
      {/** Always render overlay to avoid mount/unmount overhead */}
      <DragDropOverlay isActive={isActive} />
      <DragDropProvider>
        <DragDropModal
          files={draggedFiles}
          isVisible={showModal}
          setShowModal={setShowModal}
          onOptionSelect={handleOptionSelect}
        />
      </DragDropProvider>
    </div>
  );
}
