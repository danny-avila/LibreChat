import React from 'react';
import { FileUp } from 'lucide-react';
import cleanupPreset from '~/utils/cleanupPreset.js';
import { useRecoilValue } from 'recoil';

import store from '~/store';

const FileUpload = ({ onFileSelected }) => {
  // const setPresets = useSetRecoilState(store.presets);
  const endpointsConfig = useRecoilValue(store.endpointsConfig);

  const handleFileChange = event => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = e => {
      const jsonData = JSON.parse(e.target.result);
      onFileSelected({ ...cleanupPreset({ preset: jsonData, endpointsConfig }), presetId: null });
    };
    reader.readAsText(file);
  };

  return (
    <label
      htmlFor="file-upload"
      className=" mr-1 flex h-auto cursor-pointer  items-center rounded bg-transparent px-2 py-1 text-xs font-medium font-normal text-gray-600 transition-colors hover:bg-slate-200 hover:text-green-700 dark:bg-transparent dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-green-500"
    >
      <FileUp className="mr-1 flex w-[22px] items-center stroke-1" />
      <span className="flex text-xs ">Import</span>
      <input
        id="file-upload"
        value=""
        type="file"
        className="hidden "
        accept=".json"
        onChange={handleFileChange}
      />
    </label>
  );
};

export default FileUpload;
