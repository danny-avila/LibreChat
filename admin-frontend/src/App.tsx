import { type FC, useMemo, useState, useCallback } from 'react';
import { useAdminConfig } from './hooks/useAdminConfig';
import { SETTING_GROUPS } from './constants';
import { createValuesMap } from './utils/helpers';
import { ConfirmUnsavedModal, RestartingOverlay, AdminLayout } from './components';

const App: FC = () => {
  const {
    overrides,
    draft,
    loading,
    error,
    saving,
    restarting,
    dirty,
    editDraft,
    discardDraft,
    applyChanges,
    isAuthError,
  } = useAdminConfig();

  const [modalOpen, setModalOpen] = useState(false);

  const values = useMemo<Record<string, unknown>>(() => {
    const source = draft && Object.keys(draft).length ? draft : overrides;
    return createValuesMap(source, SETTING_GROUPS);
  }, [draft, overrides]);

  // event handlers defined before return

  const handleHome = useCallback(() => {
    if (dirty) {
      setModalOpen(true);
    } else {
      window.location.assign('/');
    }
  }, [dirty]);

  const handleDiscard = () => {
    discardDraft();
    window.location.assign('/');
  };

  const handleApplyAndGo = async () => {
    await applyChanges();
    // Countdown handled by RestartOverlay then redirect inside overlay or we can redirect after restart done
  };

  return (
    <>
      {restarting && <RestartingOverlay />}

      {loading ? (
        <div className="flex items-center justify-center h-screen">
          <p className="text-lg">Loading…</p>
        </div>
      ) : isAuthError ? (
        <div className="flex flex-col items-center justify-center h-screen space-y-4">
          <div className="max-w-md text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Restricted</h1>
            <p className="text-lg text-red-600 mb-6">{error}</p>
            <div className="space-y-3">
              <a
                href="/"
                className="inline-block w-full px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors"
              >
                Go to LibreChat
              </a>
              <button
                onClick={() => window.location.reload()}
                className="inline-block w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      ) : error ? (
        <div className="flex items-center justify-center h-screen">
          <p className="text-lg text-red-600">Error: {error}</p>
        </div>
      ) : (
        <>
          <AdminLayout
            values={values}
            saving={saving}
            restarting={restarting}
            dirty={dirty}
            onUpdateSetting={editDraft}
            onApplyChanges={applyChanges}
            onHome={handleHome}
          />

          {modalOpen && (
            <ConfirmUnsavedModal
              onCancel={() => setModalOpen(false)}
              onDiscard={handleDiscard}
              onApply={handleApplyAndGo}
            />
          )}
        </>
      )}
    </>
  );
};

export default App; 