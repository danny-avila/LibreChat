import { useDragHelpers } from '~/hooks';
import DragDropModal from '~/components/Chat/Input/Files/DragDropModal';
import DragDropOverlay from '~/components/Chat/Input/Files/DragDropOverlay';
import { DragDropProvider } from '~/Providers';
import { cn } from '~/utils';

interface DragDropWrapperProps {
  children: React.ReactNode;
  className?: string;
}

export default function DragDropWrapper({ children, className }: DragDropWrapperProps) {
  const { canDrop, isOver, drop, showModal, setShowModal, handleOptionSelect } = useDragHelpers();

  return (
    <div ref={drop} className={cn('relative flex h-full w-full', className)}>
      {children}
      {/* ChatGPT 스타일 전체 화면 드롭 오버레이 — 파일을 끌고 오면 표시 */}
      <DragDropOverlay isActive={isOver && canDrop} />
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
