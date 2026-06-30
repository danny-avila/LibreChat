import React, { useRef } from 'react';
import { v4 } from 'uuid';
import { Check } from 'lucide-react';
import { dataService } from 'librechat-data-provider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@librechat/client';
import type { TImageModel } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import { IMAGE_STYLES } from './styles';

const PILL_TRIGGER_CLASS =
  'h-8 w-auto gap-1 rounded-lg border-border-light bg-transparent px-2.5 text-xs text-text-secondary hover:bg-surface-hover';

const DROPDOWN_CONTENT_CLASS = 'bg-surface-secondary text-text-primary';

const readImageDimensions = (file: File): Promise<{ width: number; height: number }> =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: 0, height: 0 });
    };
    img.src = url;
  });

interface ImageControlsProps {
  selectedModel: TImageModel | undefined;
  style: string;
  aspectRatio: string;
  aspectRatios: string[];
  imageUrls: string[];
  onStyleChange: (value: string) => void;
  onAspectRatioChange: (value: string) => void;
  onImageUrlsChange: (urls: string[]) => void;
  onUploadStart: () => void;
  onUploadEnd: () => void;
  isUploading: boolean;
}

export default function ImageControls({
  selectedModel,
  style,
  aspectRatio,
  aspectRatios,
  imageUrls,
  onStyleChange,
  onAspectRatioChange,
  onImageUrlsChange,
  onUploadStart,
  onUploadEnd,
  isUploading,
}: ImageControlsProps) {
  const localize = useLocalize();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    onUploadStart();
    try {
      const { width, height } = await readImageDimensions(file);
      const formData = new FormData();
      formData.append('endpoint', 'openAI');
      formData.append('file', file, encodeURIComponent(file.name));
      formData.append('file_id', v4());
      formData.append('width', String(width));
      formData.append('height', String(height));

      const uploaded = await dataService.uploadImage(formData);
      onImageUrlsChange(uploaded.filepath ? [uploaded.filepath] : []);
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
      className="flex flex-wrap items-center gap-2"
      role="group"
      aria-label={localize('com_ui_images')}
    >
      <Select value={style} onValueChange={onStyleChange}>
        <SelectTrigger className={PILL_TRIGGER_CLASS} aria-label={localize('com_ui_image_style')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className={DROPDOWN_CONTENT_CLASS}>
          {IMAGE_STYLES.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {localize(s.labelKey)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={aspectRatio} onValueChange={onAspectRatioChange}>
        <SelectTrigger className={PILL_TRIGGER_CLASS} aria-label={localize('com_ui_aspect_ratio')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className={DROPDOWN_CONTENT_CLASS}>
          {aspectRatios.map((ratio) => (
            <SelectItem key={ratio} value={ratio}>
              {ratio}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selectedModel?.supportsEdit && (
        <>
          <button
            type="button"
            className="flex h-8 items-center gap-1 rounded-lg border border-border-light bg-transparent px-2.5 text-xs text-text-secondary hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            aria-label={localize('com_ui_reference_image')}
          >
            {isUploading ? localize('com_ui_image_generating') : localize('com_ui_reference_image')}
            {imageUrls.length > 0 && (
              <Check className="h-3.5 w-3.5 text-green-500" aria-hidden="true" />
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
            aria-hidden="true"
          />
        </>
      )}
    </div>
  );
}
