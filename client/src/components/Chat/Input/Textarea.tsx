import TextareaAutosize from 'react-textarea-autosize';
import { useTextarea } from '~/hooks';

export default function Textarea({ value, onChange, setText, submitMessage }) {
  const {
    inputRef,
    handleKeyDown,
    handleKeyUp,
    handleCompositionStart,
    handleCompositionEnd,
    placeholder,
  } = useTextarea({ setText, submitMessage });

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
      id="prompt-textarea"
      tabIndex={0}
      data-testid="text-input"
      // style={{ maxHeight: '200px', height: '52px', overflowY: 'hidden' }}
      rows={1}
      placeholder={placeholder}
      className="gizmo:md:py-3.5 gizmo:placeholder-black/50 gizmo:dark:placeholder-white/50 gizmo:pl-10 gizmo:md:pl-[55px] m-0 h-auto max-h-52 w-full resize-none overflow-y-hidden border-0 bg-transparent py-[10px] pl-12 pr-10 focus:ring-0 focus-visible:ring-0 dark:bg-transparent md:py-4 md:pl-[46px] md:pr-12"
    />
  );
}
