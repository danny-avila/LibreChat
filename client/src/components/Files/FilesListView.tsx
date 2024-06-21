import React from 'react';
import FileSidePanel from './FileList/FileSidePanel';
import { Outlet, useNavigate, useParams } from 'react-router-dom';
import FilesSectionSelector from './FilesSectionSelector';
import { Button } from '../ui';

export default function FilesListView() {
  const params = useParams();
  const navigate = useNavigate();
  return (
    <div className="bg-[#f9f9f9] p-0 lg:p-7">
      <div className="m-4 flex w-full flex-row justify-between md:m-2">
        <FilesSectionSelector />
        {params?.fileId && (
          <Button
            className="block lg:hidden"
            variant={'outline'}
            size={'sm'}
            onClick={() => {
              navigate('/d/files');
            }}
          >
            Go back
          </Button>
        )}
      </div>
      <div className="flex w-full flex-row divide-x">
        <div
          className={`mr-2 w-full xl:w-1/3 ${
            params.fileId ? 'hidden w-1/2 lg:block lg:w-1/2' : 'md:w-full'
          }`}
        >
          <FileSidePanel />
        </div>
        <div
          className={`h-[85vh] w-full overflow-y-auto xl:w-2/3 ${
            params.fileId ? 'lg:w-1/2' : 'hidden md:w-1/2 lg:block'
          }`}
        >
          <Outlet />
        </div>
      </div>
    </div>
  );
}
