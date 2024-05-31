import { excelMimeTypes, QueryKeys } from 'librechat-data-provider';
import type { QueryClient } from '@tanstack/react-query';
import type { TFile } from 'librechat-data-provider';
import SheetPaths from '~/components/svg/Files/SheetPaths';
import TextPaths from '~/components/svg/Files/TextPaths';
import FilePaths from '~/components/svg/Files/FilePaths';
import CodePaths from '~/components/svg/Files/CodePaths';
import UrlPaths from '~/components/svg/Files/UrlPaths'; // Importe o caminho SVG para URLs

export const partialTypes = ['text/x-'];

const textDocument = {
  paths: TextPaths,
  fill: '#FF5588',
  title: 'Document',
};

const spreadsheet = {
  paths: SheetPaths,
  fill: '#10A37F',
  title: 'Spreadsheet',
};

const codeFile = {
  paths: CodePaths,
  fill: '#FF6E3C',
  title: 'Code',
};

const urlFile = {
  paths: UrlPaths,
  fill: '#3cb4c9',
  title: 'URL',
};

export const fileTypes = {
  file: {
    paths: FilePaths,
    fill: '#0000FF',
    title: 'File',
  },
  text: textDocument,
  csv: spreadsheet,
  pdf: textDocument,
  'text/x-': codeFile,
  url: urlFile, // Adicione o novo tipo de arquivo URL aqui
};

export const getFileType = (
  type = '',
): {
  paths: React.FC;
  fill: string;
  title: string;
} => {
  if (fileTypes[type]) {
    return fileTypes[type];
  }

  if (excelMimeTypes.test(type)) {
    return spreadsheet;
  }

  const partialMatch = partialTypes.find((partial) => type.includes(partial));
  if (partialMatch && fileTypes[partialMatch]) {
    return fileTypes[partialMatch];
  }

  const category = type.split('/')[0] || 'text';
  if (fileTypes[category]) {
    return fileTypes[category];
  }

  return fileTypes.file;
};

export function formatDate(dateString) {
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const date = new Date(dateString);
  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();

  return `${day} ${month} ${year}`;
}

export function addFileToCache(queryClient: QueryClient, newfile: TFile) {
  const currentFiles = queryClient.getQueryData<TFile[]>([QueryKeys.files]);

  if (!currentFiles) {
    console.warn('No current files found in cache, skipped updating file query cache');
    return;
  }

  const fileIndex = currentFiles.findIndex((file) => file.file_id === newfile.file_id);

  if (fileIndex > -1) {
    console.warn('File already exists in cache, skipped updating file query cache');
    return;
  }

  queryClient.setQueryData<TFile[]>(
    [QueryKeys.files],
    [
      {
        ...newfile,
      },
      ...currentFiles,
    ],
  );
}
