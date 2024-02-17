export default function useSetFilesToDelete() {
  const setFilesToDelete = (files: Record<string, unknown>) =>
    localStorage.setItem('filesToDelete', JSON.stringify(files));
  return setFilesToDelete;
}
