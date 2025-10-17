import React, { useState, useRef, useCallback } from 'react';
import { useSetRecoilState } from 'recoil';
// @ts-ignore - no type definitions available
import AvatarEditor from 'react-avatar-editor';
import { FileImage, RotateCw, Upload, ZoomIn, ZoomOut, Move, X } from 'lucide-react';
import { fileConfig as defaultFileConfig, mergeFileConfig } from 'librechat-data-provider';
import {
  Label,
  Slider,
  Button,
  Spinner,
  OGDialog,
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
  OGDialogTrigger,
  useToastContext,
} from '@librechat/client';
import type { TUser } from 'librechat-data-provider';
import { useUploadAvatarMutation, useGetFileConfig } from '~/data-provider';
import { cn, formatBytes } from '~/utils';
import { useLocalize } from '~/hooks';
import store from '~/store';

interface AvatarEditorRef {
  getImageScaledToCanvas: () => HTMLCanvasElement;
  getImage: () => HTMLImageElement;
}

interface Position {
  x: number;
  y: number;
}

function Avatar() {
  const setUser = useSetRecoilState(store.user);

  const [scale, setScale] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [position, setPosition] = useState<Position>({ x: 0.5, y: 0.5 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const editorRef = useRef<AvatarEditorRef | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [image, setImage] = useState<string | File | null>(null);
  const [isDialogOpen, setDialogOpen] = useState<boolean>(false);

  const { data: fileConfig = defaultFileConfig } = useGetFileConfig({
    select: (data) => mergeFileConfig(data),
  });

  const localize = useLocalize();
  const { showToast } = useToastContext();

  const { mutate: uploadAvatar, isLoading: isUploading } = useUploadAvatarMutation({
    onSuccess: (data) => {
      showToast({ message: localize('com_ui_upload_success') });
      setUser((prev) => ({ ...prev, avatar: data.url }) as TUser);
    },
    onError: (error) => {
      console.error('Error:', error);
      showToast({ message: localize('com_ui_upload_error'), status: 'error' });
    },
  });

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    handleFile(file);
  };

  const handleFile = useCallback(
    (file: File | undefined) => {
      if (fileConfig.avatarSizeLimit != null && file && file.size <= fileConfig.avatarSizeLimit) {
        setImage(file);
        setScale(1);
        setRotation(0);
        setPosition({ x: 0.5, y: 0.5 });
      } else {
        const megabytes =
          fileConfig.avatarSizeLimit != null ? formatBytes(fileConfig.avatarSizeLimit) : 2;
        showToast({
          message: localize('com_ui_upload_invalid_var', { 0: megabytes + '' }),
          status: 'error',
        });
      }
    },
    [fileConfig.avatarSizeLimit, localize, showToast],
  );

  const handleScaleChange = (value: number[]) => {
    setScale(value[0]);
  };

  const handleZoomIn = () => {
    setScale((prev) => Math.min(prev + 0.2, 5));
  };

  const handleZoomOut = () => {
    setScale((prev) => Math.max(prev - 0.2, 1));
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handlePositionChange = (position: Position) => {
    setPosition(position);
  };

  const handleUpload = () => {
    if (editorRef.current) {
      const canvas = editorRef.current.getImageScaledToCanvas();
      canvas.toBlob((blob) => {
        if (blob) {
          const formData = new FormData();
          formData.append('file', blob, 'avatar.png');
          formData.append('manual', 'true');
          uploadAvatar(formData);
        }
      }, 'image/png');
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      handleFile(file);
    },
    [handleFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  const resetImage = useCallback(() => {
    setImage(null);
    setScale(1);
    setRotation(0);
    setPosition({ x: 0.5, y: 0.5 });
  }, []);

  const handleReset = () => {
    setScale(1);
    setRotation(0);
    setPosition({ x: 0.5, y: 0.5 });
  };

  return (
    <OGDialog
      open={isDialogOpen}
      onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) {
          resetImage();
        }
      }}
    >
      <div className="flex items-center justify-between">
        <span>{localize('com_nav_profile_picture')}</span>
        <OGDialogTrigger asChild>
          <Button variant="outline">
            <FileImage className="mr-2 flex w-[22px] items-center" />
            <span>{localize('com_nav_change_picture')}</span>
          </Button>
        </OGDialogTrigger>
      </div>

      <OGDialogContent showCloseButton={false} className="w-11/12 max-w-md">
        <OGDialogHeader>
          <OGDialogTitle className="text-lg font-medium leading-6 text-text-primary">
            {image != null ? localize('com_ui_preview') : localize('com_ui_upload_image')}
          </OGDialogTitle>
        </OGDialogHeader>
        <div className="flex flex-col items-center justify-center p-2">
          {image != null ? (
            <>
              <div
                className={cn(
                  'relative overflow-hidden rounded-full ring-4 ring-gray-200 transition-all dark:ring-gray-700',
                  isDragging && 'cursor-move ring-blue-500 dark:ring-blue-400',
                )}
                onMouseDown={() => setIsDragging(true)}
                onMouseUp={() => setIsDragging(false)}
                onMouseLeave={() => setIsDragging(false)}
              >
                <AvatarEditor
                  ref={editorRef}
                  image={image}
                  width={280}
                  height={280}
                  border={0}
                  borderRadius={140}
                  color={[255, 255, 255, 0.6]}
                  scale={scale}
                  rotate={rotation}
                  position={position}
                  onPositionChange={handlePositionChange}
                  className="cursor-move"
                />
                {!isDragging && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity hover:opacity-100">
                    <div className="rounded-full bg-black/50 p-2">
                      <Move className="h-6 w-6 text-white" />
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 w-full space-y-6">
                {/* Zoom Controls */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="zoom-slider" className="text-sm font-medium">
                      {localize('com_ui_zoom')}
                    </Label>
                    <span className="text-sm text-text-secondary">{Math.round(scale * 100)}%</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleZoomOut}
                      disabled={scale <= 1}
                      aria-label={localize('com_ui_zoom_out')}
                      className="shrink-0"
                    >
                      <ZoomOut className="h-4 w-4" />
                    </Button>
                    <Slider
                      id="zoom-slider"
                      value={[scale]}
                      min={1}
                      max={5}
                      step={0.1}
                      onValueChange={handleScaleChange}
                      className="flex-1"
                      aria-label={localize('com_ui_zoom_level')}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleZoomIn}
                      disabled={scale >= 5}
                      aria-label={localize('com_ui_zoom_in')}
                      className="shrink-0"
                    >
                      <ZoomIn className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-center space-x-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleRotate}
                    className="flex items-center space-x-2"
                    aria-label={localize('com_ui_rotate_90')}
                  >
                    <RotateCw className="h-4 w-4" />
                    <span className="text-sm">{localize('com_ui_rotate')}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleReset}
                    className="flex items-center space-x-2"
                    aria-label={localize('com_ui_reset_adjustments')}
                  >
                    <X className="h-4 w-4" />
                    <span className="text-sm">{localize('com_ui_reset')}</span>
                  </Button>
                </div>

                {/* Helper Text */}
                <p className="text-center text-xs text-gray-500 dark:text-gray-400">
                  {localize('com_ui_editor_instructions')}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="mt-6 flex w-full space-x-3">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={resetImage}
                  disabled={isUploading}
                >
                  {localize('com_ui_cancel')}
                </Button>
                <Button
                  variant="submit"
                  type="button"
                  className={cn('w-full', isUploading ? 'cursor-not-allowed opacity-90' : '')}
                  onClick={handleUpload}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <Spinner className="icon-sm mr-2" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  {localize('com_ui_upload')}
                </Button>
              </div>
            </>
          ) : (
            <div
              className="flex h-72 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-transparent transition-colors hover:border-gray-400 dark:border-gray-600 dark:hover:border-gray-500"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              role="button"
              tabIndex={0}
              onClick={openFileDialog}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openFileDialog();
                }
              }}
              aria-label={localize('com_ui_upload_avatar_label')}
            >
              <FileImage className="mb-4 size-16 text-gray-400" />
              <p className="mb-2 text-center text-sm font-medium text-text-primary">
                {localize('com_ui_drag_drop')}
              </p>
              <p className="mb-4 text-center text-xs text-text-secondary">
                {localize('com_ui_max_file_size', {
                  0:
                    fileConfig.avatarSizeLimit != null
                      ? formatBytes(fileConfig.avatarSizeLimit)
                      : '2MB',
                })}
              </p>
              <Button type="button" variant="secondary" onClick={openFileDialog}>
                {localize('com_ui_select_file')}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".png, .jpg, .jpeg"
                onChange={handleFileChange}
                aria-label={localize('com_ui_file_input_avatar_label')}
              />
            </div>
          )}
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}

export default Avatar;
