import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Button, Label, TextareaAutosize } from '@librechat/client';
import { Upload, FileText, Loader2, CheckCircle } from 'lucide-react';
import { useAuthContext } from '~/hooks';

interface AddCrawlConfigFormData {
  name: string;
  description: string;
  file: File | null;
}

interface PrefilledParams {
  name?: string;
  description?: string;
}

interface AddCrawlConfigFormProps {
  onSubmit?: (data: AddCrawlConfigFormData & { toolResponse?: any }) => void;
  onCancel?: () => void;
  prefilledParams?: PrefilledParams;
  serverName?: string;
  isSubmitted?: boolean;
  isCancelled?: boolean;
  submittedData?: {
    name: string;
    description?: string;
    fileName?: string;
  };
}

type UploadProgress = 'idle' | 'creating' | 'uploading' | 'complete' | 'error';

const AddCrawlConfigForm: React.FC<AddCrawlConfigFormProps> = ({
  onSubmit,
  onCancel,
  prefilledParams = {},
  serverName = '',
  isSubmitted = false,
  isCancelled = false,
  submittedData,
}) => {
  const { token } = useAuthContext();
  const [formData, setFormData] = useState({ name: '', description: '' });
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pre-populate form from prefilledParams
  useEffect(() => {
    if (prefilledParams && Object.keys(prefilledParams).length > 0) {
      setFormData((prev) => ({
        ...prev,
        ...(prefilledParams.name && { name: prefilledParams.name }),
        ...(prefilledParams.description && { description: prefilledParams.description }),
      }));
    }
  }, [prefilledParams]);

  const handleInputChange = useCallback((field: 'name' | 'description', value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Validate file extension
      if (!selectedFile.name.endsWith('.seospiderconfig')) {
        alert('Please select a .seospiderconfig file');
        return;
      }
      // Validate file size (10MB limit)
      const maxSize = 10 * 1024 * 1024; // 10MB in bytes
      if (selectedFile.size > maxSize) {
        alert('File size must be less than 10MB');
        return;
      }
      setFile(selectedFile);
    }
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!file || !formData.name) {
        return;
      }

      setIsSubmitting(true);
      setUploadProgress('creating');
      let configId: string | null = null;

      try {
        // Step 1: Create config and get presigned URL
        const createToolId = `create_crawl_config_mcp_${serverName}`;

        console.log('🔍 Calling create_crawl_config tool:', {
          toolId: createToolId,
          payload: {
            name: formData.name,
            description: formData.description || undefined,
          },
        });

        const createResponse = await fetch(
          `/api/agents/tools/${encodeURIComponent(createToolId)}/call`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              name: formData.name,
              description: formData.description || undefined,
            }),
          },
        );

        if (!createResponse.ok) {
          const errorText = await createResponse.text();
          console.error('❌ HTTP error response from create_crawl_config:', {
            status: createResponse.status,
            statusText: createResponse.statusText,
            errorBody: errorText,
          });
          throw new Error(`Failed to create config: ${createResponse.status} - ${errorText}`);
        }

        const result = await createResponse.json();
        console.log('✅ Create config response:', result);

        // Parse the result - may be nested in result.result
        let configData;
        if (result.result) {
          if (typeof result.result === 'string') {
            try {
              configData = JSON.parse(result.result);
            } catch (parseError) {
              console.error('❌ Error parsing result:', parseError);
              console.error('Raw result:', result.result);
              throw new Error(
                `Failed to parse server response: ${result.result.substring(0, 100)}`,
              );
            }
          } else {
            configData = result.result;
          }
        } else {
          configData = result;
        }

        console.log('📦 Parsed config data:', configData);

        configId = configData.id;
        // Handle both camelCase (uploadUrl) and snake_case (upload_url)
        const uploadUrl = configData.upload_url || configData.uploadUrl;

        if (!uploadUrl) {
          console.error('❌ No upload URL in response. Config data:', configData);
          throw new Error(
            'No upload URL received from server. The config may have been created but file upload cannot proceed.',
          );
        }

        console.log('[Upload] Config created:', {
          id: configId,
          hasUploadUrl: !!uploadUrl,
        });

        // Step 2: Upload file to S3
        setUploadProgress('uploading');
        console.log('[Upload] Starting S3 upload...', {
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
        });

        const uploadResponse = await fetch(uploadUrl, {
          method: 'PUT',
          body: file,
          headers: {
            'Content-Type': 'application/octet-stream',
          },
        });

        console.log(
          '[Upload] S3 response status:',
          uploadResponse.status,
          uploadResponse.statusText,
        );

        if (!uploadResponse.ok) {
          const errorText = await uploadResponse
            .text()
            .catch(() => 'Unable to read error response');
          console.error('[Upload] S3 upload failed:', {
            status: uploadResponse.status,
            statusText: uploadResponse.statusText,
            errorBody: errorText,
          });
          throw new Error(`Upload failed: ${uploadResponse.status} - ${errorText}`);
        }

        console.log('[Upload] Upload successful!');
        setUploadProgress('complete');

        onSubmit?.({
          ...formData,
          file,
          toolResponse: { result: configData },
        });
      } catch (error) {
        console.error('[Upload] Error uploading crawl config:', error);
        setUploadProgress('error');

        // Cleanup: delete DB record if created but upload failed
        if (configId) {
          try {
            const deleteToolId = `delete_crawl_config_mcp_${serverName}`;
            console.log('[Upload] Cleaning up failed upload, config ID:', configId);

            await fetch(`/api/agents/tools/${encodeURIComponent(deleteToolId)}/call`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ id: configId }),
            });

            console.log('[Upload] Cleanup successful');
          } catch (cleanupError) {
            console.error('[Upload] Failed to cleanup config:', cleanupError);
          }
        }

        onSubmit?.({
          ...formData,
          file,
          toolResponse: { error: error instanceof Error ? error.message : 'Unknown error' },
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [formData, file, onSubmit, serverName, token],
  );

  const handleCancel = useCallback(() => {
    onCancel?.();
  }, [onCancel]);

  const isValid = formData.name && file;

  // Cancelled state
  if (isCancelled) {
    return (
      <div className="my-4 rounded-xl border border-red-400 bg-red-50 p-4 shadow-lg dark:bg-red-900/20">
        <div className="mb-4">
          <div className="mb-2 flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-red-500"></div>
            <h3 className="text-lg font-semibold text-red-800 dark:text-red-200">
              Crawl Config Upload Cancelled
            </h3>
          </div>
          <p className="text-sm text-red-700 dark:text-red-300">
            The crawl config upload form was cancelled.
          </p>
        </div>
      </div>
    );
  }

  // Submitted state
  if (isSubmitted && submittedData) {
    return (
      <div className="my-4 rounded-xl border-2 border-green-500 bg-gray-800 p-4 shadow-lg">
        <div className="mb-4">
          <div className="mb-2 flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <h3 className="text-lg font-semibold text-green-400">
              Crawl Config Uploaded Successfully
            </h3>
          </div>
          <p className="text-sm text-green-300">
            The crawl configuration has been uploaded successfully.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <Label className="mb-2 block text-sm font-medium text-white">Name</Label>
            <div className="flex items-center gap-2 rounded-md border border-green-500 bg-gray-700 px-3 py-2 text-white opacity-75">
              <FileText className="h-4 w-4" />
              <span>{submittedData.name}</span>
            </div>
          </div>

          {submittedData.fileName && (
            <div>
              <Label className="mb-2 block text-sm font-medium text-white">File</Label>
              <div className="flex items-center gap-2 rounded-md border border-green-500 bg-gray-700 px-3 py-2 text-white opacity-75">
                <FileText className="h-4 w-4" />
                <span>{submittedData.fileName}</span>
              </div>
            </div>
          )}

          {submittedData.description && (
            <div>
              <Label className="mb-2 block text-sm font-medium text-white">Description</Label>
              <div className="flex items-center gap-2 rounded-md border border-green-500 bg-gray-700 px-3 py-2 text-white opacity-75">
                <FileText className="h-4 w-4" />
                <span>{submittedData.description}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Active form state
  return (
    <div className="my-4 rounded-xl border border-gray-600 bg-gray-800 p-4 shadow-lg">
      <div className="mb-4">
        <div className="mb-2 flex items-center gap-2">
          <div className="h-3 w-3 animate-pulse rounded-full bg-blue-500"></div>
          <h3 className="text-lg font-semibold text-white">Upload Crawl Configuration</h3>
        </div>
        <p className="text-sm text-gray-300">
          Upload a ScreamingFrog SEO Spider configuration file. Chat is disabled until you submit or
          cancel this form.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Name Input */}
        <div>
          <Label htmlFor="name" className="mb-2 block text-sm font-medium text-white">
            Config Name
          </Label>
          <input
            id="name"
            type="text"
            value={formData.name}
            onChange={(e) => handleInputChange('name', e.target.value)}
            placeholder="e.g., My Crawl Config"
            className="w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
            disabled={isSubmitting}
          />
        </div>

        {/* Description TextArea */}
        <div>
          <Label htmlFor="description" className="mb-2 block text-sm font-medium text-white">
            Description (Optional)
          </Label>
          <TextareaAutosize
            id="description"
            value={formData.description}
            onChange={(e) => handleInputChange('description', e.target.value)}
            placeholder="Optional description for this config"
            minRows={2}
            maxRows={4}
            className="w-full resize-none rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Description"
            disabled={isSubmitting}
          />
        </div>

        {/* File Upload */}
        <div>
          <Label className="mb-2 block text-sm font-medium text-white">
            Config File <span className="text-red-400">*</span>
          </Label>
          {!file ? (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".seospiderconfig"
                onChange={handleFileChange}
                className="hidden"
                disabled={isSubmitting}
              />
              <Button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-500 bg-transparent text-white hover:border-blue-500 hover:bg-gray-700"
                disabled={isSubmitting}
              >
                <Upload className="mr-2 h-4 w-4" />
                Select ScreamingFrog Config File
              </Button>
              <p className="mt-2 text-sm text-gray-400">
                Upload a .seospiderconfig file (max 10MB)
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-md border border-gray-600 bg-gray-700 p-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-white">{file.name}</span>
                <span className="text-xs text-gray-400">({(file.size / 1024).toFixed(1)} KB)</span>
              </div>
              <Button
                type="button"
                onClick={() => setFile(null)}
                variant="ghost"
                size="sm"
                className="text-red-400 hover:bg-red-900/20 hover:text-red-300"
                disabled={isSubmitting}
              >
                Remove
              </Button>
            </div>
          )}
        </div>

        {/* Progress Indicators */}
        {isSubmitting && (
          <div className="space-y-2 rounded-md bg-blue-900/20 p-3">
            <div className="flex items-center gap-2">
              {uploadProgress === 'creating' && (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                  <span className="text-sm text-blue-300">Creating configuration...</span>
                </>
              )}
              {uploadProgress === 'uploading' && (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                  <span className="text-sm text-blue-300">Uploading file to S3...</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          <Button
            type="button"
            onClick={handleCancel}
            variant="outline"
            className="flex-1 border-gray-600 bg-transparent text-gray-300 hover:bg-gray-700"
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={!isValid || isSubmitting}
            className="flex-1 bg-blue-600 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-600"
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                Uploading...
              </span>
            ) : (
              'Upload Config'
            )}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default AddCrawlConfigForm;
