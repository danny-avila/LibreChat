import TextareaAutosize from 'react-textarea-autosize';

export default function Textarea({ value, onChange, ...rest }) {
  return (
    <TextareaAutosize
      value={value}
      onChange={onChange}
      autoFocus
      id="prompt-textarea"
      tabIndex={0}
      data-id="request-:R3apdm:-3"
      // style={{ maxHeight: '200px', height: '52px', overflowY: 'hidden' }}
      rows={1}
      placeholder="Message ChatGPT…"
      className="gizmo:md:py-3.5 gizmo:placeholder-black/50 gizmo:dark:placeholder-white/50 gizmo:pl-10 gizmo:md:pl-[55px] m-0 h-auto max-h-52 w-full resize-none overflow-y-hidden border-0 bg-transparent py-[10px] pl-12 pr-10 focus:ring-0 focus-visible:ring-0 dark:bg-transparent md:py-4 md:pl-[46px] md:pr-12"
      {...rest}
    />
  );
}
