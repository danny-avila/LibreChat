import React from 'react';
import VectorStoreList from './VectorStoreList';
import { TVectorStore } from '~/common';
import VectorStoreButton from './VectorStoreButton';
import { Button, Input } from '~/components/ui';
import FilesSectionSelector from '../FilesSectionSelector';
import ActionButton from '../ActionButton';
import DeleteIconButton from '../DeleteIconButton';
import { ListFilter } from 'lucide-react';
import { useLocalize } from '~/hooks';

const fakeVectorStores: TVectorStore[] = [
  {
    name: 'VectorStore 1',
    bytes: 10000,
    file_counts: {
      total: 10,
      in_progress: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    },
    created_at: '2022-01-01T10:00:00',
    object: 'vector_store',
    _id: '1',
  },
  {
    name: 'VectorStore 2',
    bytes: 10000,
    file_counts: {
      total: 10,
      in_progress: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    },
    created_at: '2022-01-01T10:00:00',
    object: 'vector_store',
    _id: '2',
  },
  {
    name: 'VectorStore 3',
    bytes: 10000,
    file_counts: {
      total: 10,
      in_progress: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    },
    created_at: '2022-01-01T10:00:00',
    object: 'vector_store',
    _id: '3',
  },
  {
    name: 'VectorStore 4',
    bytes: 10000,
    file_counts: {
      total: 10,
      in_progress: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    },
    created_at: '2022-01-01T10:00:00',
    object: 'vector_store',
    _id: '4',
  },
  {
    name: 'VectorStore 5',
    bytes: 10000,
    file_counts: {
      total: 10,
      in_progress: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    },
    created_at: '2022-01-01T10:00:00',
    object: 'vector_store',
    _id: '5',
  },
  {
    name: 'VectorStore 6',
    bytes: 2000,
    file_counts: {
      total: 10,
      in_progress: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    },
    created_at: '2022-01-01T10:00:00',
    object: 'vector_store',
    _id: '6',
  },
  {
    name: 'VectorStore 6',
    bytes: 2000,
    file_counts: {
      total: 10,
      in_progress: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    },
    created_at: '2022-01-01T10:00:00',
    object: 'vector_store',
    _id: '6',
  },
  {
    name: 'VectorStore 6',
    bytes: 2000,
    file_counts: {
      total: 10,
      in_progress: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    },
    created_at: '2022-01-01T10:00:00',
    object: 'vector_store',
    _id: '6',
  },
  {
    name: 'VectorStore 6',
    bytes: 2000,
    file_counts: {
      total: 10,
      in_progress: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    },
    created_at: '2022-01-01T10:00:00',
    object: 'vector_store',
    _id: '6',
  },
  {
    name: 'VectorStore 6',
    bytes: 2000,
    file_counts: {
      total: 10,
      in_progress: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    },
    created_at: '2022-01-01T10:00:00',
    object: 'vector_store',
    _id: '6',
  },
  {
    name: 'VectorStore 6',
    bytes: 2000,
    file_counts: {
      total: 10,
      in_progress: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    },
    created_at: '2022-01-01T10:00:00',
    object: 'vector_store',
    _id: '6',
  },
  {
    name: 'VectorStore 6',
    bytes: 2000,
    file_counts: {
      total: 10,
      in_progress: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    },
    created_at: '2022-01-01T10:00:00',
    object: 'vector_store',
    _id: '6',
  },
  {
    name: 'VectorStore 6',
    bytes: 2000,
    file_counts: {
      total: 10,
      in_progress: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    },
    created_at: '2022-01-01T10:00:00',
    object: 'vector_store',
    _id: '6',
  },
  {
    name: 'VectorStore 6',
    bytes: 2000,
    file_counts: {
      total: 10,
      in_progress: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    },
    created_at: '2022-01-01T10:00:00',
    object: 'vector_store',
    _id: '6',
  },
];

export default function VectorStoreSidePanel() {
  const localize = useLocalize();
  const deleteVectorStore = (id: string | undefined) => {
    // Define delete functionality here
    console.log(`Deleting VectorStore with id: ${id}`);
  };

  return (
    <div className="flex flex-col">
      <div className="m-3 flex max-h-[10vh] flex-col">
        <h2 className="text-lg">
          <strong>Vector Stores</strong>
        </h2>
        <div className="m-1 mt-2 flex w-full flex-row justify-between gap-x-2 lg:m-0">
          <div className="flex w-2/3 flex-row">
            <Button variant="ghost" className="m-0 mr-2 p-0">
              <ListFilter className="h-4 w-4" />
            </Button>
            <Input
              placeholder={localize('com_files_filter')}
              value={''}
              onChange={() => {
                console.log('changed');
              }}
              className="max-w-sm dark:border-gray-500"
            />
          </div>
          <div className="w-1/3">
            <VectorStoreButton
              onClick={() => {
                console.log('Add Vector Store');
              }}
            />
          </div>
        </div>
      </div>
      <div className="mr-2 mt-2 max-h-[80vh] w-full overflow-y-auto">
        <VectorStoreList vectorStores={fakeVectorStores} deleteVectorStore={deleteVectorStore} />
      </div>
    </div>
  );
}
