import * as Dialog from '@radix-ui/react-dialog';

export default function DialogImage({ src = '', width = 1920, height = 1080 }) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay
        className="radix-state-open:animate-show fixed inset-0 z-100 flex items-center justify-center overflow-hidden bg-black/90 dark:bg-black/80"
        style={{ pointerEvents: 'auto' }}
      >
        <Dialog.Close asChild>
          <button
            className="absolute right-4 top-4 text-gray-50 transition hover:text-gray-200"
            type="button"
          >
            <svg
              stroke="currentColor"
              fill="none"
              strokeWidth="2"
              viewBox="0 0 24 24"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
              height="1em"
              width="1em"
              xmlns="http://www.w3.org/2000/svg"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </Dialog.Close>
        <Dialog.Content
          className="radix-state-open:animate-contentShow relative max-h-[85vh] max-w-[90vw] shadow-xl focus:outline-hidden"
          tabIndex={-1}
          style={{ pointerEvents: 'auto', aspectRatio: height > width ? 1 / 1.75 : 1.75 / 1 }}
        >
          <img src={src} alt="Uploaded image" className="h-full w-full object-contain" />
        </Dialog.Content>
      </Dialog.Overlay>
    </Dialog.Portal>
  );
}
