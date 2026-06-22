import React, { useState } from 'react';
import DeleteIconButton from '../DeleteIconButton';
import { TrashIcon, Button } from '@librechat/client';
import { TFile } from 'librechat-data-provider/dist/types';
import UploadFileButton from '../FileList/UploadFileButton';
import UploadFileModal from '../FileList/UploadFileModal';
import { BarChart4Icon, Clock3, FileClock, FileIcon, InfoIcon, PlusIcon } from 'lucide-react';
import { useParams } from 'react-router-dom';

const tempVectorStore = {
  _id: 'vs_NeHK4JidLKJ2qo23dKLLK',
  name: 'Vector Store 1',
  usageThisMonth: '1,000,000',
  bytes: 1000000,
  lastActive: '2022-01-01T10:00:00',
  expirationPolicy: 'Never',
  expires: 'Never',
  createdAt: '2022-01-01T10:00:00',
};
const tempFilesAttached: TFile[] = [
  {
    filename: 'File1.jpg',
    object: 'file',
    bytes: 10000,
    createdAt: '2022-01-01T10:00:00',
    _id: '1',
    type: 'image',
    usage: 12,
    user: 'abc',
    file_id: 'file_id',
    embedded: true,
    filepath: 'filepath',
  },
  {
    filename: 'File1.jpg',
    object: 'file',
    bytes: 10000,
    createdAt: '2022-01-01T10:00:00',
    _id: '1',
    type: 'image',
    usage: 12,
    user: 'abc',
    file_id: 'file_id',
    embedded: true,
    filepath: 'filepath',
  },
  {
    filename: 'File1.jpg',
    object: 'file',
    bytes: 10000,
    createdAt: '2022-01-01T10:00:00',
    _id: '1',
    type: 'image',
    usage: 12,
    user: 'abc',
    file_id: 'file_id',
    embedded: true,
    filepath: 'filepath',
  },
  {
    filename: 'File1.jpg',
    object: 'file',
    bytes: 10000,
    createdAt: '2022-01-01T10:00:00',
    _id: '1',
    type: 'image',
    usage: 12,
    user: 'abc',
    file_id: 'file_id',
    embedded: true,
    filepath: 'filepath',
  },
];
const tempAssistants = [
  {
    id: 'Lorum Ipsum',
    resource: 'Lorum Ipsum',
  },
  {
    id: 'Lorum Ipsum',
    resource: 'Lorum Ipsum',
  },
  {
    id: 'Lorum Ipsum',
    resource: 'Lorum Ipsum',
  },
  {
    id: 'Lorum Ipsum',
    resource: 'Lorum Ipsum',
  },
];

export default function VectorStorePreview() {
  const [open, setOpen] = useState(false);
  const [vectorStore, setVectorStore] = useState(tempVectorStore);
  const [filesAttached, setFilesAttached] = useState(tempFilesAttached);
  const [assistants, setAssistants] = useState(tempAssistants);
  const params = useParams();

  return (
    <div className="m-3 ml-1 mr-7 bg-white p-2 sm:p-4 md:p-6 lg:p-10">
      <div className="flex flex-col justify-between md:flex-row">
        <div className="flex flex-col">
          <b className="hidden text-base md:text-lg lg:block lg:text-xl">VECTOR STORE</b>
          <b className="text-center text-xl md:text-2xl lg:text-left lg:text-3xl">
            {vectorStore.name}
          </b>
        </div>
        <div className="mt-3 flex flex-row gap-x-3 md:mt-0">
          <div>
            <DeleteIconButton
              onClick={() => {
                console.log('click');
              }}
            />
          </div>
          <div>
            <UploadFileButton
              onClick={() => {
                setOpen(true);
              }}
            />
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-col">
        <div className="flex flex-row">
          <span className="flex w-1/2 flex-row items-center md:w-2/5">
            <InfoIcon className="text-base text-gray-500 md:text-lg lg:text-xl" />
            &nbsp; ID
          </span>
          <span className="w-1/2 break-words text-gray-500 md:w-3/5">{vectorStore._id}</span>
        </div>
        <div className="mt-3 flex flex-row">
          <span className="flex w-1/2 flex-row items-center md:w-2/5">
            <BarChart4Icon className="text-base text-gray-500 md:text-lg lg:text-xl" />
            &nbsp;Usage this &nbsp;month
          </span>
          <div className="w-1/2 md:w-3/5">
            <p className="text-gray-500">
              <span className="text-[#91c561]">0 KB hours</span>
              &nbsp; Free until end of 2024
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-row">
          <span className="flex w-1/2 flex-row items-center md:w-2/5">
            <InfoIcon className="text-base text-gray-500 md:text-lg lg:text-xl" />
            &nbsp;Size
          </span>
          <span className="w-1/2 text-gray-500 md:w-3/5">{vectorStore.bytes} bytes</span>
        </div>
        <div className="mt-3 flex flex-row">
          <span className="flex w-1/2 flex-row items-center md:w-2/5">
            <Clock3 className="text-base text-gray-500 md:text-lg lg:text-xl" />
            &nbsp;Last active
          </span>
          <span className="w-1/2 text-gray-500 md:w-3/5">{vectorStore.lastActive}</span>
        </div>
        <div className="mt-3 flex flex-row">
          <span className="flex w-1/2 flex-row items-center md:w-2/5">
            <InfoIcon className="text-base text-gray-500 md:text-lg lg:text-xl" />
            &nbsp;Expiration policy
          </span>
          <span className="w-1/2 text-gray-500 md:w-3/5">{vectorStore.expirationPolicy}</span>
        </div>
        <div className="mt-3 flex flex-row">
          <span className="flex w-1/2 flex-row items-center md:w-2/5">
            <FileClock className="text-base text-gray-500 md:text-lg lg:text-xl" />
            &nbsp;Expires
          </span>
          <span className="w-1/2 text-gray-500 md:w-3/5">{vectorStore.expires}</span>
        </div>
        <div className="mt-3 flex flex-row">
          <span className="flex w-1/2 flex-row items-center md:w-2/5">
            <Clock3 className="text-base text-gray-500 md:text-lg lg:text-xl" />
            &nbsp;Created At
          </span>
          <span className="w-1/2 text-gray-500 md:w-3/5">{vectorStore.createdAt.toString()}</span>
        </div>
      </div>

      <div className="mt-10 flex flex-col">
        <div>
          <b className="text-base md:text-lg lg:text-xl">Files attached</b>
        </div>
        <div className="flex flex-col divide-y">
          <div className="mt-2 flex flex-row">
            <div className="w-1/2 text-base md:text-lg lg:w-2/3 lg:text-xl">File</div>
            <div className="w-1/2 text-base md:text-lg lg:w-1/3 lg:text-xl">Uploaded</div>
          </div>
          <div>
            {filesAttached.map((file, index) => (
              <div key={index} className="my-2 flex h-5 flex-row">
                <div className="lg:w flex w-1/2 flex-row content-center lg:w-2/3">
                  <FileIcon className="m-0 size-5 p-0" />
                  <div className="ml-2 content-center">{file.filename}</div>
                </div>
                <div className="flex w-1/2 flex-row lg:w-1/3">
                  <div className="content-center text-nowrap">{file.createdAt?.toString()}</div>
                  <Button
                    className="my-0 ml-3 h-min bg-transparent p-0 text-[#666666] hover:bg-slate-200"
                    onClick={() => console.log('click')}
                  >
                    <TrashIcon className="m-0 p-0" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-10 flex flex-col">
        <div className="flex flex-row justify-between">
          <b className="text-base md:text-lg lg:text-xl">Used by</b>
          <Button variant={'default'}>
            <PlusIcon className="h-4 w-4 font-bold" />
            &nbsp; Create Assistant
          </Button>
        </div>
        <div className="flex flex-col divide-y">
          <div className="mt-2 flex flex-row">
            <div className="w-1/2 text-base md:text-lg lg:w-2/3 lg:text-xl">Resource</div>
            <div className="w-1/2 text-base md:text-lg lg:w-1/3 lg:text-xl">ID</div>
          </div>
          <div>
            {assistants.map((assistant, index) => (
              <div key={index} className="flex flex-row">
                <div className="w-1/2 content-center lg:w-2/3">{assistant.resource}</div>
                <div className="flex w-1/2 flex-row lg:w-1/3">
                  <div className="content-center">{assistant.id}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {open && <UploadFileModal open={open} onOpenChange={setOpen} />}
    </div>
  );
}
