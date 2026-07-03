import useLocalFilesContext from './LocalFilesContext';

export default function useDirectoryHandle() {
  const {
    status,
    folderName,
    isSupported,
    error,
    connectFolder,
    disconnectFolder,
    reconnectFolder,
  } = useLocalFilesContext();

  return {
    status,
    folderName,
    isSupported,
    error,
    connectFolder,
    disconnectFolder,
    reconnectFolder,
    isConnected: status === 'connected',
    needsReconnect: status === 'needs_reconnect',
  };
}
