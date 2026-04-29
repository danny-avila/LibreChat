import { useDragHelpers } from '~/hooks';
import DragDropModal from '~/components/Chat/Input/Files/DragDropModal';
import { DragDropProvider } from '~/Providers';
import { cn } from '~/utils';

interface DragDropWrapperProps {
  children: React.ReactNode;
  className?: string;
}

export default function DragDropWrapper({ children, className }: DragDropWrapperProps) {
  const { drop, showModal, setShowModal, handleOptionSelect } = useDragHelpers();

  return (
    <div ref={drop} className={cn('relative flex h-full w-full', className)}>
      {children}
      <DragDropProvider>
        <DragDropModal
          isVisible={showModal}
          setShowModal={setShowModal}
          onOptionSelect={handleOptionSelect}
        />
      </DragDropProvider>
    </div>
  );
}
