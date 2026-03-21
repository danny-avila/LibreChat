import { OGDialog, DialogTemplate } from '@librechat/client';

const ImportantNoticeModal = ({
  open,
  onOpenChange,
  onAccept,
  onDecline,
}: {
  open: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onAccept: () => void;
  onDecline: () => void;
}) => {
  const handleOpenChange = (isOpen: boolean) => {
    if (open && !isOpen) {
      return;
    }
    onOpenChange(isOpen);
  };

  return (
    <OGDialog open={open} onOpenChange={handleOpenChange}>
      <DialogTemplate
        title=""
        headerClassName="hidden"
        className="w-11/12 max-w-3xl sm:w-3/4 md:w-1/2 lg:w-2/5"
        showCloseButton={false}
        showCancelButton={false}
        main={
          <section tabIndex={0} className="max-h-[60vh] overflow-y-auto p-4">
            <div className="prose dark:prose-invert w-full max-w-none !text-text-primary">
              {/* Icon */}
              <div className="mb-2 flex justify-center text-red-600">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-24 w-24"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>

              {/* English heading */}
              <h2 className="!mt-0 mb-1 text-center text-2xl font-bold text-red-600">
                {'Important Notice'}
              </h2>
              <p className="text-center text-sm !text-text-secondary mb-4">(Testing Version)</p>

              <hr />

              <p>ਇਹ ਐਪਲੀਕੇਸ਼ਨ ਵਰਤਮਾਨ ਵਿੱਚ ਵਿਕਾਸ ਅਧੀਨ ਹੈ ਅਤੇ ਸਿਰਫ਼ ਟੈਸਟਿੰਗ ਅਤੇ ਪ੍ਰਮਾਣਿਕਤਾ ਦੇ ਉਦੇਸ਼ਾਂ ਲਈ ਪ੍ਰਦਾਨ ਕੀਤੀ ਗਈ ਹੈ।</p>
              <p>ਇਹ ਕੋਈ ਜਨਤਕ ਸਲਾਹਕਾਰੀ ਸੇਵਾ ਨਹੀਂ ਹੈ ਅਤੇ ਅਸਲ-ਸੰਸਾਰ ਦੇ ਖੇਤੀ ਫੈਸਲਿਆਂ ਲਈ ਇਸ 'ਤੇ ਭਰੋਸਾ ਨਹੀਂ ਕੀਤਾ ਜਾਣਾ ਚਾਹੀਦਾ ਹੈ।</p>
              <p>ਸਲਾਹਕਾਰੀਆਂ ਪ੍ਰਯੋਗਾਤਮਕ ਹਨ ਅਤੇ ਸਿਰਫ਼ ਚੁਣੇ ਹੋਏ ਰਾਜਾਂ ਲਈ ਝੋਨੇ ਦੀਆਂ ਫ਼ਸਲਾਂ ਤੱਕ ਸੀਮਤ ਹਨ।</p>
              <p>ਮੌਸਮ ਡੇਟਾ ਅਤੇ ਮਾਰਕੀਟ ਡੇਟਾ ਪ੍ਰਮਾਣਿਕ ਸਰਕਾਰੀ ਸਰੋਤਾਂ ਤੋਂ ਹਨ।</p>
              <p><strong>ਅੱਗੇ ਵਧ ਕੇ, ਤੁਸੀਂ ਇਸ ਐਪ ਨੂੰ ਸਿਰਫ਼ ਇੱਕ ਟੈਸਟਰ ਵਜੋਂ ਵਰਤਣ ਲਈ ਸਹਿਮਤ ਹੁੰਦੇ ਹੋ।</strong></p>

            </div>
          </section>
        }
        buttons={
          <>
            <button
              onClick={onDecline}
              className="inline-flex items-center justify-center rounded-lg border border-border-heavy bg-surface-secondary px-4 py-2 text-sm text-text-primary hover:bg-surface-active"
            >
              {/* <span>DECLINE</span> */}
              {'ਅਸਵੀਕਾਰ ਕਰੋ'}
            </button>
            <button
              onClick={onAccept}
              className="inline-flex items-center justify-center rounded-lg border border-border-heavy bg-surface-secondary px-4 py-2 text-sm text-text-primary hover:bg-green-500 hover:text-white focus:bg-green-500 focus:text-white dark:hover:bg-green-600 dark:focus:bg-green-600"
            >
              {/* <span>I AGREE &amp; PROCEED</span> */}
              {'ਮੈਂ ਸਹਿਮਤ ਹਾਂ & ਅੱਗੇ ਵਧੋ'}
            </button>
          </>
        }
      />
    </OGDialog>
  );
};

export default ImportantNoticeModal;
