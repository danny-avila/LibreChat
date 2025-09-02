import React from 'react';
import { useNavigate } from 'react-router-dom';
import { TVectorStore } from '~/common';
import { DotsIcon, TrashIcon } from '~/components/svg';
import { Button } from '~/components/ui';

type VectorStoreListItemProps = {
  vectorStore: TVectorStore;
  deleteVectorStore: (id: string) => void;
};

export default function VectorStoreListItem({
  vectorStore,
  deleteVectorStore,
}: VectorStoreListItemProps) {
  const navigate = useNavigate();
  return (
    <div
      onClick={() => {
        navigate('vs_id_abcdef');
      }}
      className="w-100 mt-2 flex cursor-pointer flex-row justify-around rounded-md border border-0 bg-white p-4 transition duration-300 ease-in-out hover:bg-slate-200"
    >
      <div className="flex w-1/2 flex-col justify-around align-middle">
        <strong>{vectorStore.name}</strong>
        <p className="text-sm text-gray-500">{vectorStore.object}</p>
      </div>
      <div className="w-2/6 text-gray-500">
        <p>
          {vectorStore.file_counts.total} Files ({vectorStore.bytes / 1000}KB)
        </p>
        <p className="text-sm">{vectorStore.created_at.toString()}</p>
      </div>
      <div className="flex w-1/6 flex-col justify-around sm:flex-row">
        <Button className="m-0 w-full content-center bg-transparent p-0 text-gray-500 hover:bg-slate-200 sm:w-min">
          <DotsIcon className="text-grey-100 m-0 p-0" />
        </Button>
        <Button
          className="m-0 w-full bg-transparent p-0 text-[#666666] hover:bg-slate-200 sm:w-fit"
          onClick={() => deleteVectorStore(vectorStore._id)}
        >
          <TrashIcon className="m-0 p-0" />
        </Button>
      </div>
    </div>
  );
}
