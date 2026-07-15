import React, { useEffect, useState } from 'react';
import { Table, Button, Spinner } from '~/components/ui';
import { useAuthContext } from '~/hooks';
import { endpoints, dataService } from '~/data-provider';

export default function GeneratedFilesView() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const { isAuthenticated } = useAuthContext();

  useEffect(() => {
    if (!isAuthenticated) return;
    const fetchFiles = async () => {
      try {
        const response = await fetch('/api/generated-files');
        const data = await response.json();
        setFiles(data);
      } catch (error) {
        console.error('Failed to fetch generated files:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchFiles();
  }, [isAuthenticated]);

  const handleDownload = async (fileId, filename) => {
    try {
      const response = await fetch(`/api/generated-files/${fileId}/download`);
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
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
      const response = await fetch(`/api/generated-files/${fileId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Delete failed');
      setFiles(files.filter((f) => f._id !== fileId));
    } catch (error) {
      console.error('Delete failed:', error);
    }
  };

  if (loading) {
    return <Spinner />;
  }

  return (
    <div className="p-4">
      <h2 className="mb-4 text-xl font-semibold">Generated Files</h2>
      {files.length === 0 ? (
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
            {files.map((file) => (
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
