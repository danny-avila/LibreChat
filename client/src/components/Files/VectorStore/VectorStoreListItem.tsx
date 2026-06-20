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
      className="w-100 mt-2 flex cursor-pointer flex-row justify-around rounded-md border border-0 bg-surface-secondary p-4 transition duration-300 ease-in-out hover:bg-surface-hover"
    >
      <div className="flex w-1/2 flex-col justify-around align-middle">
        <strong>{vectorStore.name}</strong>
        <p className="text-sm text-text-tertiary">{vectorStore.object}</p>
      </div>
      <div className="w-2/6 text-text-tertiary">
        <p>
          {localize('com_ui_files_count_size', {
            0: vectorStore.file_counts?.total ?? 0,
            1: (vectorStore.bytes ?? 0) / 1000,
          })}
        </p>
        <p className="text-sm">{vectorStore.created_at.toString()}</p>
      </div>
      <div className="flex w-1/6 flex-col justify-around sm:flex-row">
        <Button className="m-0 w-full content-center bg-transparent p-0 text-text-tertiary hover:bg-surface-hover sm:w-min">
          <DotsIcon className="text-grey-100 m-0 p-0" />
        </Button>
        <Button
          className="m-0 w-full bg-transparent p-0 text-text-destructive hover:bg-surface-hover sm:w-fit"
          onClick={() => deleteVectorStore(vectorStore._id)}
        >
          <TrashIcon className="m-0 p-0" />
        </Button>
      </div>
    </div>
  );
}
