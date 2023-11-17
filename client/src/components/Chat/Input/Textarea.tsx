import TextareaAutosize from 'react-textarea-autosize';
import { supportsFiles } from '~/common';
import { useTextarea } from '~/hooks';
import { cn, removeFocusOutlines } from '~/utils';

export default function Textarea({ value, onChange, setText, submitMessage, endpoint }) {
  const {
    inputRef,
    handleKeyDown,
    handleKeyUp,
    handleCompositionStart,
    handleCompositionEnd,
    onHeightChange,
    placeholder,
  } = useTextarea({ setText, submitMessage });

  const className = supportsFiles[endpoint]
    ? // ? 'm-0 w-full resize-none border-0 bg-transparent py-3.5 pr-10 focus:ring-0 focus-visible:ring-0 dark:bg-transparent placeholder-black/50 dark:placeholder-white/50 pl-10 md:py-3.5 md:pr-12 md:pl-[55px]'
  // : 'm-0 w-full resize-none border-0 bg-transparent py-[10px] pr-10 focus:ring-0 focus-visible:ring-0 dark:bg-transparent md:py-4 md:pr-12 gizmo:md:py-3.5 gizmo:placeholder-black/50 gizmo:dark:placeholder-white/50 pl-3 md:pl-4';
    'm-0 w-full resize-none border-0 bg-transparent py-3.5 pr-10 focus:ring-0 focus-visible:ring-0 dark:bg-transparent placeholder-black/50 dark:placeholder-white/50 pl-10 md:py-3.5 md:pr-12 md:pl-[55px]'
    : 'm-0 w-full resize-none border-0 bg-transparent py-[10px] pr-10 focus:ring-0 focus-visible:ring-0 dark:bg-transparent md:py-3.5 md:pr-12 placeholder-black/50 dark:placeholder-white/50 pl-3 md:pl-4';

  return (
    <TextareaAutosize
      ref={inputRef}
      autoFocus
      value={value}
      onChange={onChange}
      onKeyUp={handleKeyUp}
      onKeyDown={handleKeyDown}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
      onHeightChange={onHeightChange}
      id="prompt-textarea"
      tabIndex={0}
      data-testid="text-input"
      // style={{ maxHeight: '200px', height: '52px', overflowY: 'hidden' }}
      rows={1}
      placeholder={placeholder}
      // className="m-0 w-full resize-none border-0 bg-transparent py-[10px] pr-10 focus:ring-0 focus-visible:ring-0 dark:bg-transparent md:py-4 md:pr-12 gizmo:md:py-3.5 gizmo:placeholder-black/50 gizmo:dark:placeholder-white/50 pl-12 gizmo:pl-10 md:pl-[46px] gizmo:md:pl-[55px]"
      // className="gizmo:md:py-3.5 gizmo:placeholder-black/50 gizmo:dark:placeholder-white/50 gizmo:pl-10 gizmo:md:pl-[55px] m-0 h-auto max-h-52 w-full resize-none overflow-y-hidden border-0 bg-transparent py-[10px] pl-12 pr-10 focus:ring-0 focus-visible:ring-0 dark:bg-transparent md:py-4 md:pl-[46px] md:pr-12"
      className={cn(className, removeFocusOutlines, 'max-h-52')}
    />
  );
}
