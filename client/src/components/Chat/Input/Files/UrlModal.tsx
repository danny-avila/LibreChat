import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui';
import { cn } from '~/utils/';
import { useLocalize } from '~/hooks';

const UrlModal = ({ open, url, setUrl, onClose, onSubmit }) => {
  const [isUrlValid, setIsUrlValid] = useState(false);
  const localize = useLocalize();

  const inputClass =
    'focus:shadow-outline w-full appearance-none rounded-md border px-3 py-2 text-sm leading-tight text-gray-700 dark:text-white shadow focus:border-green-500 focus:outline-none focus:ring-0 dark:bg-gray-800 dark:border-gray-700/80';

  useEffect(() => {
    setIsUrlValid(isValidUrl(url));
  }, [url]);

  const isValidUrl = (url) => {
    try {
      new URL(url);
      return true;
    } catch (_) {
      return false;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className={cn('w-5/12 overflow-x-auto shadow-2xl dark:bg-gray-700 dark:text-white')}
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-medium leading-6 text-gray-900 dark:text-gray-200">
            {localize('com_ui_enter_url')}
            <div className="text-token-text-tertiary text-sm">(Arxiv, WebSite & Youtube)</div>
          </DialogTitle>
        </DialogHeader>
        <div className="overflow-x-auto p-4 sm:p-6 sm:pt-4">
          <input
            type="text"
            value={url}
            {...{ max: 512 }}
            className={inputClass}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://"
          />
          <div className="mt-4 flex justify-end">
            <button
              className="btn btn-neutral relative"
              onClick={onSubmit}
              disabled={!isUrlValid} // Botão habilitado apenas se a URL for válida
            >
              {localize('com_ui_submit')}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UrlModal;
