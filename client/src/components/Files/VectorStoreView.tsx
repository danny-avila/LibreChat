import React from 'react';
import VectorStoreSidePanel from './VectorStore/VectorStoreSidePanel';
import FilesSectionSelector from './FilesSectionSelector';
import { Button } from '../ui';
import { Outlet, useNavigate, useParams } from 'react-router-dom';

export default function VectorStoreView() {
  const params = useParams();
  const navigate = useNavigate();
  return (
    <div className="max-h-[100vh] bg-[#f9f9f9] p-0 lg:p-7">
      <div className="m-4 flex max-h-[10vh] w-full flex-row justify-between md:m-2">
        <FilesSectionSelector />
        <Button
          className="block lg:hidden"
          variant={'outline'}
          size={'sm'}
          onClick={() => {
            navigate('/d/vector-stores');
          }}
        >
          Go back
        </Button>
      </div>
      <div className="flex max-h-[90vh] w-full flex-row divide-x">
        <div
          className={`max-h-full w-full xl:w-1/3 ${
            params.vectorStoreId ? 'hidden w-1/2 lg:block lg:w-1/2' : 'md:w-full'
          }`}
        >
          <VectorStoreSidePanel />
        </div>
        <div
          className={`max-h-full w-full overflow-y-auto xl:w-2/3 ${
            params.vectorStoreId ? 'lg:w-1/2' : 'hidden md:w-1/2 lg:block'
          }`}
        >
          <Outlet />
        </div>
      </div>
    </div>
  );
}
