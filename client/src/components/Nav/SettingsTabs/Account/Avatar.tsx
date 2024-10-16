import React, { useState, useRef, useCallback } from 'react';
import { FileImage, RotateCw, Upload } from 'lucide-react';
import { useSetRecoilState } from 'recoil';
import AvatarEditor from 'react-avatar-editor';
import { fileConfig as defaultFileConfig, mergeFileConfig } from 'librechat-data-provider';
import type { TUser } from 'librechat-data-provider';
import {
  Slider,
  Button,
  Spinner,
  OGDialog,
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
  OGDialogTrigger,
} from '~/components';
import { useUploadAvatarMutation, useGetFileConfig } from '~/data-provider';
import { useToastContext } from '~/Providers';
import { cn, formatBytes } from '~/utils';
import { useLocalize } from '~/hooks';
import store from '~/store';

function Avatar() {
  const setUser = useSetRecoilState(store.user);
  const [image, setImage] = useState<string | File | null>(null);
  const [isDialogOpen, setDialogOpen] = useState<boolean>(false);
  const [scale, setScale] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const editorRef = useRef<AvatarEditor | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const openButtonRef = useRef<HTMLButtonElement>(null);

  const { data: fileConfig = defaultFileConfig } = useGetFileConfig({
    select: (data) => mergeFileConfig(data),
  });

  const localize = useLocalize();
  const { showToast } = useToastContext();

  const { mutate: uploadAvatar, isLoading: isUploading } = useUploadAvatarMutation({
    onSuccess: (data) => {
      showToast({ message: localize('com_ui_upload_success') });
      setUser((prev) => ({ ...prev, avatar: data.url } as TUser));
      openButtonRef.current?.click();
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

  const handleFile = (file: File | undefined) => {
    if (fileConfig.avatarSizeLimit && file && file.size <= fileConfig.avatarSizeLimit) {
      setImage(file);
      setScale(1);
      setRotation(0);
    } else {
      const megabytes = fileConfig.avatarSizeLimit ? formatBytes(fileConfig.avatarSizeLimit) : 2;
      showToast({
        message: localize('com_ui_upload_invalid_var', megabytes + ''),
        status: 'error',
      });
    }
  };

  const handleScaleChange = (value: number[]) => {
    setScale(value[0]);
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleUpload = () => {
    if (editorRef.current) {
      const canvas = editorRef.current.getImageScaledToCanvas();
      canvas.toBlob((blob) => {
        if (blob) {
          const formData = new FormData();
          formData.append('input', blob, 'avatar.png');
          formData.append('manual', 'true');
          uploadAvatar(formData);
        }
      }, 'image/png');
    }
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    handleFile(file);
  }, []);

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
  }, []);

  return (
    <OGDialog
      open={isDialogOpen}
      onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) {
          resetImage();
          setTimeout(() => {
            openButtonRef.current?.focus();
          }, 0);
        }
      }}
    >
      <div className="flex items-center justify-between">
        <span>{localize('com_nav_profile_picture')}</span>
        <OGDialogTrigger ref={openButtonRef} className="btn btn-neutral relative">
          <FileImage className="mr-2 flex w-[22px] items-center stroke-1" />
          <span>{localize('com_nav_change_picture')}</span>
        </OGDialogTrigger>
      </div>

      <OGDialogContent className="w-11/12 max-w-sm" style={{ borderRadius: '12px' }}>
        <OGDialogHeader>
          <OGDialogTitle className="text-lg font-medium leading-6 text-text-primary">
            {image ? localize('com_ui_preview') : localize('com_ui_upload_image')}
          </OGDialogTitle>
        </OGDialogHeader>
        <div className="flex flex-col items-center justify-center">
          {image ? (
            <>
              <div className="relative overflow-hidden rounded-full">
                <AvatarEditor
                  ref={editorRef}
                  image={image}
                  width={250}
                  height={250}
                  border={0}
                  borderRadius={125}
                  color={[255, 255, 255, 0.6]}
                  scale={scale}
                  rotate={rotation}
                />
              </div>
              <div className="mt-4 flex w-full flex-col items-center space-y-4">
                <div className="flex w-full items-center justify-center space-x-4">
                  <span className="text-sm">Zoom:</span>
                  <Slider
                    value={[scale]}
                    min={1}
                    max={5}
                    step={0.001}
                    onValueChange={handleScaleChange}
                    className="w-2/3 max-w-xs"
                  />
                </div>
                <button
                  onClick={handleRotate}
                  className="rounded-full bg-gray-200 p-2 transition-colors hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500"
                >
                  <RotateCw className="h-5 w-5" />
                </button>
              </div>
              <Button
                className={cn(
                  'btn btn-primary mt-4 flex w-full hover:bg-green-600',
                  isUploading ? 'cursor-not-allowed opacity-90' : '',
                )}
                onClick={handleUpload}
                disabled={isUploading}
              >
                {isUploading ? (
                  <Spinner className="icon-sm mr-2" />
                ) : (
                  <Upload className="mr-2 h-5 w-5" />
                )}
                {localize('com_ui_upload')}
              </Button>
            </>
          ) : (
            <div
              className="flex h-64 w-11/12 flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-transparent dark:border-gray-600"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
            >
              <FileImage className="mb-4 size-12 text-gray-400" />
              <p className="mb-2 text-center text-sm text-gray-500 dark:text-gray-400">
                {localize('com_ui_drag_drop')}
              </p>
              <Button variant="secondary" onClick={openFileDialog}>
                {localize('com_ui_select_file')}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".png, .jpg, .jpeg"
                onChange={handleFileChange}
              />
            </div>
          )}
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}

export default Avatar;
