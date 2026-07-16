import React, { useEffect, useState, useCallback } from 'react';
import { useAuthContext } from '~/hooks';
import { getGeneratedFiles, downloadGeneratedFile, deleteGeneratedFile } from '~/data-provider';

export default function GeneratedFilesView() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { isAuthenticated } = useAuthContext();

  const fetchFiles = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getGeneratedFiles();
      setFiles(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch generated files:', err);
      setError(err?.message || 'Failed to fetch files');
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const handleDownload = async (fileId, filename) => {
    try {
      const response = await downloadGeneratedFile(fileId);
      const blob = new Blob([response.data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  const handleDelete = async (fileId) => {
    try {
      await deleteGeneratedFile(fileId);
      setFiles((prev) => (Array.isArray(prev) ? prev.filter((f) => f._id !== fileId) : []));
    } catch (error) {
      console.error('Delete failed:', error);
    }
  };

  if (loading) {
    return <div className="p-4 text-gray-500">Loading...</div>;
  }

  if (error) {
    return (
      <div className="p-4">
        <h2 className="mb-4 text-xl font-semibold">Generated Files</h2>
        <p className="text-red-500">Error: {error}</p>
        <button
          onClick={fetchFiles}
          className="mt-2 rounded bg-blue-500 px-3 py-1 text-white hover:bg-blue-600"
        >
          Retry
        </button>
      </div>
    );
  }

  const fileList = Array.isArray(files) ? files : [];

  return (
    <div className="p-4">
      <h2 className="mb-4 text-xl font-semibold">Generated Files</h2>
      {fileList.length === 0 ? (
        <p className="text-gray-500">No generated files yet.</p>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b text-left">
              <th className="p-2">Filename</th>
              <th className="p-2">Type</th>
              <th className="p-2">Size</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {fileList.map((file) => (
              <tr key={file._id} className="border-b">
                <td className="p-2">{file.filename}</td>
                <td className="p-2">{file.type}</td>
                <td className="p-2">{(file.size / 1024).toFixed(1)} KB</td>
                <td className="p-2 flex gap-2">
                  <button
                    onClick={() => handleDownload(file._id, file.filename)}
                    className="rounded bg-blue-500 px-3 py-1 text-white hover:bg-blue-600"
                  >
                    Download
                  </button>
                  <button
                    onClick={() => handleDelete(file._id)}
                    className="rounded bg-red-500 px-3 py-1 text-white hover:bg-red-600"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
