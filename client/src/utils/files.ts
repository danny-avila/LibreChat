import SheetPaths from '~/components/svg/Files/SheetPaths';
import TextPaths from '~/components/svg/Files/TextPaths';
import FilePaths from '~/components/svg/Files/FilePaths';
import CodePaths from '~/components/svg/Files/CodePaths';

export const partialTypes = ['text/x-'];

const textDocument = {
  paths: TextPaths,
  fill: '#FF5588',
  title: 'Document',
};

const codeFile = {
  paths: CodePaths,
  fill: '#FF6E3C',
  // TODO: make this dynamic to the language
  title: 'Code',
};

export const fileTypes = {
  /* Category matches */
  file: {
    paths: FilePaths,
    fill: '#0000FF',
    title: 'File',
  },
  text: textDocument,
  // application:,

  /* Partial matches */
  csv: {
    paths: SheetPaths,
    fill: '#10A37F',
    title: 'Spreadsheet',
  },
  pdf: textDocument,
  'text/x-': codeFile,

  /* Exact matches */
  // 'application/json':,
  // 'text/html':,
  // 'text/css':,
  // image,
};

// export const getFileType = (type = '') => {
//   let fileType = fileTypes.file;
//   const exactMatch = fileTypes[type];
//   const partialMatch = !exactMatch && partialTypes.find((type) => type.includes(type));
//   const category = (!partialMatch && (type.split('/')[0] ?? 'text') || 'text');

//   if (exactMatch) {
//     fileType = exactMatch;
//   } else if (partialMatch) {
//     fileType = fileTypes[partialMatch];
//   } else if (fileTypes[category]) {
//     fileType = fileTypes[category];
//   }

//   if (!fileType) {
//     fileType = fileTypes.file;
//   }

//   return fileType;
// };

export const getFileType = (type = '') => {
  // Direct match check
  if (fileTypes[type]) {
    return fileTypes[type];
  }

  // Partial match check
  const partialMatch = partialTypes.find((partial) => type.includes(partial));
  if (partialMatch && fileTypes[partialMatch]) {
    return fileTypes[partialMatch];
  }

  // Category check
  const category = type.split('/')[0] || 'text';
  if (fileTypes[category]) {
    return fileTypes[category];
  }

  // Default file type
  return fileTypes.file;
};
