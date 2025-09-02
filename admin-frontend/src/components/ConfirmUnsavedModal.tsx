import React from 'react';

interface Props {
  onApply: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

export const ConfirmUnsavedModal: React.FC<Props> = ({ onApply, onDiscard, onCancel }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-4">Unsaved changes</h2>
        <p className="text-sm text-gray-700 mb-6">
          You have modified settings that haven’t been applied.
        </p>
        <div className="flex justify-end space-x-3">
          <button
            className="px-4 py-2 text-sm rounded-md border border-gray-300 hover:bg-gray-50"
            onClick={onDiscard}
          >
            Discard &amp; Leave
          </button>
          <button
            className="px-4 py-2 text-sm rounded-md border border-gray-300 hover:bg-gray-50"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 text-sm rounded-md bg-green-500 text-white hover:bg-green-600"
            onClick={onApply}
          >
            Apply &amp; Restart
          </button>
        </div>
      </div>
    </div>
  );
}; 