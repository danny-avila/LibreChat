import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, DotsIcon, TrashIcon } from '@librechat/client';
import { TVectorStore } from '~/common';
import { useLocalize } from '~/hooks';

type VectorStoreListItemProps = {
  vectorStore: TVectorStore;
  deleteVectorStore: (id: string) => void;
};

export default function VectorStoreListItem({
  vectorStore,
  deleteVectorStore,
}: VectorStoreListItemProps) {
  const navigate = useNavigate();
  const localize = useLocalize();
  return (
    <div
      onClick={() => {
        navigate('vs_id_abcdef');
      }}
      className="bg-surface-secondary hover:bg-surface-hover mt-2 flex cursor-pointer flex-row justify-around rounded-md border border-0 p-4 transition duration-300 ease-in-out"
    >
      <div className="flex w-1/2 flex-col justify-around align-middle">
        <strong>{vectorStore.name}</strong>
        <p className="text-text-tertiary text-sm">{vectorStore.object}</p>
      </div>
      <div className="text-text-tertiary w-2/6">
        <p>
          {localize('com_ui_files_count_size', {
            0: vectorStore.file_counts?.total ?? 0,
            1: (vectorStore.bytes ?? 0) / 1000,
          })}
        </p>
        <p className="text-sm">{vectorStore.created_at.toString()}</p>
      </div>
      <div className="flex w-1/6 flex-col justify-around sm:flex-row">
        <Button className="text-text-tertiary hover:bg-surface-hover m-0 w-full content-center bg-transparent p-0 sm:w-min">
          <DotsIcon className="text-text-tertiary m-0 p-0" />
        </Button>
        <Button
          className="text-text-destructive hover:bg-surface-hover m-0 w-full bg-transparent p-0 sm:w-fit"
          onClick={() => deleteVectorStore(vectorStore._id)}
        >
          <TrashIcon className="m-0 p-0" />
        </Button>
      </div>
    </div>
  );
}
