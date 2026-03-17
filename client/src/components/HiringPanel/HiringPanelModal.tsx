/* eslint-disable i18next/no-literal-string */
import { useEffect } from 'react';
import { useRecoilState } from 'recoil';
import { X } from 'lucide-react';
import { hiringPanelState } from '~/store/hiringPanel';
import HiringPanel from './HiringPanel';

export function HiringPanelModal() {
  const [state, setState] = useRecoilState(hiringPanelState);

  const handleClose = () => setState({ isOpen: false });

  useEffect(() => {
    document.body.style.overflow = state.isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [state.isOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && state.isOpen) handleClose(); };
    if (state.isOpen) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.isOpen]);

  if (!state.isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        style={{ zIndex: 998 }}
        onClick={handleClose}
        aria-hidden="true"
      />
      <div
        className="rounded-2xl bg-white shadow-2xl dark:bg-gray-900"
        style={{ position: 'fixed', inset: '16px', zIndex: 999, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        role="dialog"
        aria-modal="true"
        aria-label="Hiring & Onboarding"
      >
        {/* Close button — floats top-right */}
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 z-10 rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex-1 overflow-y-auto">
          <HiringPanel />
        </div>
      </div>
    </>
  );
}
