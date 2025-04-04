import React from 'react';
import FileSidePanel from './FileList/FileSidePanel';
import { Outlet, useNavigate, useParams } from 'react-router-dom';
import FilesSectionSelector from './FilesSectionSelector';
import { useLocalize } from '~/hooks';
import { Button } from '../ui';

export default function FilesListView() {
  const params = useParams();
  const navigate = useNavigate();
  const localize = useLocalize();
  return (
    <div className="bg-[#f9f9f9] p-0 lg:p-7">
      <div className="m-4 flex w-full flex-row justify-between md:m-2">
        <FilesSectionSelector />
        {params.fileId != null && params.fileId && (
          <Button
            className="block lg:hidden"
            variant={'outline'}
            size={'sm'}
            onClick={() => {
              navigate('/d/files');
            }}
          >
            {localize('com_ui_go_back')}
          </Button>
        )}
      </div>
      <div className="flex w-full flex-row divide-x">
        <div
          className={`mr-2 w-full xl:w-1/3 ${
            params.fileId != null && params.fileId ? 'hidden w-1/2 lg:block lg:w-1/2' : 'md:w-full'
          }`}
        >
          <FileSidePanel />
        </div>
        <div
          className={`h-[85vh] w-full overflow-y-auto xl:w-2/3 ${
            params.fileId != null && params.fileId ? 'lg:w-1/2' : 'hidden md:w-1/2 lg:block'
          }`}
        >
          <Outlet />
        </div>
      </div>
    </div>
  );
}
