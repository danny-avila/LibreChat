import React, { useRef } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@librechat/client';
import type { TImageModel } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';

interface ImageControlsProps {
  models: TImageModel[];
  model: string;
  aspectRatio: string;
  aspectRatios: string[];
  param: string;
  imageUrls: string[];
  onModelChange: (value: string) => void;
  onAspectRatioChange: (value: string) => void;
  onParamChange: (value: string) => void;
  onImageUrlsChange: (urls: string[]) => void;
  onUploadStart: () => void;
  onUploadEnd: () => void;
  isUploading: boolean;
}

export default function ImageControls({
  models,
  model,
  aspectRatio,
  aspectRatios,
  param,
  imageUrls,
  onModelChange,
  onAspectRatioChange,
  onParamChange,
  onImageUrlsChange,
  onUploadStart,
  onUploadEnd,
  isUploading,
}: ImageControlsProps) {
  const localize = useLocalize();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedModel = models.find((m) => m.id === model);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('endpoint', 'openAI');
    formData.append('width', String(file.size > 0 ? 1 : 0));
    formData.append('height', String(file.size > 0 ? 1 : 0));

    onUploadStart();
    try {
      const res = await fetch('/api/files/images', { method: 'POST', body: formData });
      if (!res.ok) {
        throw new Error(`Upload failed: ${res.statusText}`);
      }
      const data = await res.json();
      const url: string = data.filepath ?? data.url ?? data.file_id ?? '';
      onImageUrlsChange(url ? [url] : []);
    } catch {
      onImageUrlsChange([]);
    } finally {
      onUploadEnd();
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div
      className="flex flex-wrap items-center gap-3"
      role="group"
      aria-label="Image generation controls"
    >
      {/* Model selector */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-text-secondary" htmlFor="image-model-select">
          {localize('com_ui_image_model')}
        </label>
        <Select value={model} onValueChange={onModelChange}>
          <SelectTrigger
            id="image-model-select"
            className="w-44"
            aria-label={localize('com_ui_image_model')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {models.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Aspect ratio selector */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-text-secondary" htmlFor="aspect-ratio-select">
          {localize('com_ui_aspect_ratio')}
        </label>
        <Select value={aspectRatio} onValueChange={onAspectRatioChange}>
          <SelectTrigger
            id="aspect-ratio-select"
            className="w-28"
            aria-label={localize('com_ui_aspect_ratio')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {aspectRatios.map((ratio) => (
              <SelectItem key={ratio} value={ratio}>
                {ratio}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Per-model param selector */}
      {selectedModel && selectedModel.paramValues.length > 0 && (
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary" htmlFor="model-param-select">
            {selectedModel.paramKey}
          </label>
          <Select value={param} onValueChange={onParamChange}>
            <SelectTrigger
              id="model-param-select"
              className="w-32"
              aria-label={selectedModel.paramKey}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {selectedModel.paramValues.map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Reference image upload (only for models that support edit) */}
      {selectedModel?.supportsEdit && (
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary">
            {localize('com_ui_reference_image')}
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex h-9 items-center rounded-lg border border-gray-200 bg-transparent px-3 text-sm hover:bg-gray-100/50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:hover:bg-gray-700"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              aria-label={localize('com_ui_reference_image')}
            >
              {isUploading
                ? localize('com_ui_image_generating')
                : localize('com_ui_reference_image')}
            </button>
            {imageUrls.length > 0 && (
              <span className="text-xs text-text-secondary">
                1 {localize('com_ui_reference_image').toLowerCase()}
              </span>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
            aria-hidden="true"
          />
        </div>
      )}
    </div>
  );
}
