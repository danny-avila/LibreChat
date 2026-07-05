import useLocalFilesContext from './LocalFilesContext';

export default function useReconnectFolder() {
  const { status, folderName, reconnectFolder, error } = useLocalFilesContext();

  return {
    status,
    folderName,
    reconnectFolder,
    error,
    needsReconnect: status === 'needs_reconnect',
  };
}
