import React, { useState, useEffect } from 'react';
import { FileText, Upload, Trash2 } from 'lucide-react';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import { Label } from '~/components/ui/Label';
import { Checkbox } from '~/components/ui/Checkbox';
import { useAuthContext } from '~/hooks/AuthContext';
import { SystemRoles } from 'librechat-data-provider';

interface GlobalFile {
  file_id: string;
  filename: string;
  bytes: number;
  type: string;
  createdAt: string;
  isGlobal: boolean;
}

const GlobalFileManager: React.FC = () => {
  const { user, token } = useAuthContext();
  const [globalFiles, setGlobalFiles] = useState<GlobalFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isGlobal, setIsGlobal] = useState(true);
  
  const isAdmin = user?.role === SystemRoles.ADMIN;

  useEffect(() => {
    if (isAdmin) {
      fetchGlobalFiles();
    }
  }, [isAdmin]);

  const fetchGlobalFiles = async () => {
    if (!isAdmin || !token) return;

    try {
      const response = await fetch('/api/files/global', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const files = await response.json();
        setGlobalFiles(files);
      } else {
        console.error('Failed to fetch global files:', response.status);
      }
    } catch (error) {
      console.error('Error fetching global files:', error);
    }
  };

  const handleFileUpload = async () => {
    if (!selectedFile || !isAdmin || !token) return;

    console.log('[/frontend] Starting file upload:', {
      fileName: selectedFile.name,
      fileSize: selectedFile.size,
      fileType: selectedFile.type,
      isAdmin,
      hasToken: !!token,
    });

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('isGlobal', 'true');
    formData.append('endpoint', 'default'); // Add endpoint for consistency

    console.log('[/frontend] FormData created:', {
      hasFile: formData.has('file'),
      hasIsGlobal: formData.has('isGlobal'),
      hasEndpoint: formData.has('endpoint'),
    });

    try {
      const response = await fetch('/api/files', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          // Don't set Content-Type - let browser set it automatically for FormData
        },
        body: formData,
      });

      console.log('[/frontend] Response received:', {
        status: response.status,
        ok: response.ok,
        statusText: response.statusText,
      });

      if (response.ok) {
        setSelectedFile(null);
        setIsGlobal(true);
        fetchGlobalFiles();
      } else {
        const error = await response.json();
        console.error('[/frontend] Upload failed:', error);
        alert(`Upload failed: ${error.message}`);
      }
    } catch (error) {
      console.error('[/frontend] Error uploading file:', error);
      alert('An error occurred during upload.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    if (!isAdmin || !token) return;

    if (!confirm('Are you sure you want to delete this global file?')) {
      return;
    }

    try {
      const response = await fetch(`/api/files/global/${fileId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        fetchGlobalFiles();
      } else {
        const error = await response.json();
        alert(`Delete failed: ${error.message}`);
      }
    } catch (error) {
      console.error('Error deleting file:', error);
      alert('An error occurred during deletion.');
    }
  };

  if (!isAdmin) {
    return (
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <p className="text-center text-gray-500">
          Only administrators can manage global files.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <FileText className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Global File Management</h2>
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="file-upload">Upload Global File</Label>
            <Input
              id="file-upload"
              type="file"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              accept=".pdf,.txt,.doc,.docx"
            />
          </div>
          
          <div className="flex items-center space-x-2">
            <Checkbox
              id="is-global"
              checked={isGlobal}
              onCheckedChange={(checked) => setIsGlobal(checked as boolean)}
            />
            <Label htmlFor="is-global">Make this file global (shared with all users)</Label>
          </div>

          <Button
            onClick={handleFileUpload}
            disabled={!selectedFile || isUploading}
            className="flex items-center gap-2"
          >
            <Upload className="h-4 w-4" />
            {isUploading ? 'Uploading...' : 'Upload File'}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold">Global Files</h3>
        {globalFiles.length === 0 ? (
          <p className="text-center text-gray-500">No global files uploaded yet.</p>
        ) : (
          <div className="space-y-2">
            {globalFiles.map((file) => (
              <div
                key={file.file_id}
                className="flex items-center justify-between rounded border p-3"
              >
                <div className="flex items-center gap-3">
                  <FileText className="h-4 w-4 text-gray-500" />
                  <div>
                    <p className="font-medium">{file.filename}</p>
                    <p className="text-sm text-gray-500">
                      {(file.bytes / 1024 / 1024).toFixed(2)} MB • {file.type}
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => handleDeleteFile(file.file_id)}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default GlobalFileManager; 