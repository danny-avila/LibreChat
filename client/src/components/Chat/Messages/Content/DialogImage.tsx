import { useState, useEffect } from 'react';
import { X, ArrowDownToLine, PanelLeftOpen, PanelLeftClose } from 'lucide-react';
import { Button, OGDialog, OGDialogContent, TooltipAnchor } from '~/components';
import { useLocalize } from '~/hooks';

export default function DialogImage({ isOpen, onOpenChange, src = '', downloadImage, args }) {
  const localize = useLocalize();
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [imageSize, setImageSize] = useState<string | null>(null);

  const getImageSize = async (url: string) => {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      const contentLength = response.headers.get('Content-Length');

      if (contentLength) {
        const bytes = parseInt(contentLength, 10);
        return formatFileSize(bytes);
      }

      const fullResponse = await fetch(url);
      const blob = await fullResponse.blob();
      return formatFileSize(blob.size);
    } catch (error) {
      console.error('Error getting image size:', error);
      return null;
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  useEffect(() => {
    if (isOpen && src) {
      getImageSize(src).then(setImageSize);
    }
  }, [isOpen, src]);

  return (
    <OGDialog open={isOpen} onOpenChange={onOpenChange}>
      <OGDialogContent
        showCloseButton={false}
        className="h-full w-full rounded-none bg-transparent"
        disableScroll={false}
        overlayClassName="bg-surface-primary opacity-95 z-50"
      >
        <div
          className={`absolute left-0 top-0 z-10 flex items-center justify-between p-4 transition-all duration-500 ease-in-out ${isPromptOpen ? 'right-80' : 'right-0'}`}
        >
          <TooltipAnchor
            description={localize('com_ui_close')}
            render={
              <Button
                onClick={() => onOpenChange(false)}
                variant="ghost"
                className="h-10 w-10 p-0 hover:bg-surface-hover"
              >
                <X className="size-6" />
              </Button>
            }
          />
          <div className="flex items-center gap-2">
            <TooltipAnchor
              description={localize('com_ui_download')}
              render={
                <Button onClick={() => downloadImage()} variant="ghost" className="h-10 w-10 p-0">
                  <ArrowDownToLine className="size-6" />
                </Button>
              }
            />
            <TooltipAnchor
              description={
                isPromptOpen
                  ? localize('com_ui_hide_image_details')
                  : localize('com_ui_show_image_details')
              }
              render={
                <Button
                  onClick={() => setIsPromptOpen(!isPromptOpen)}
                  variant="ghost"
                  className="h-10 w-10 p-0"
                >
                  {isPromptOpen ? (
                    <PanelLeftOpen className="size-6" />
                  ) : (
                    <PanelLeftClose className="size-6" />
                  )}
                </Button>
              }
            />
          </div>
        </div>

        {/* Main content area with image */}
        <div
          className={`flex h-full transition-all duration-500 ease-in-out ${isPromptOpen ? 'mr-80' : 'mr-0'}`}
        >
          <div className="flex flex-1 items-center justify-center px-4 pb-4 pt-20">
            <img
              src={src}
              alt="Image"
              className="max-h-full max-w-full object-contain"
              style={{
                maxHeight: 'calc(100vh - 6rem)',
                maxWidth: '100%',
              }}
            />
          </div>
        </div>

        {/* Side Panel */}
        <div
          className={`shadow-l-lg fixed right-0 top-0 z-20 h-full w-80 transform rounded-l-2xl border-l border-border-light bg-surface-primary transition-transform duration-500 ease-in-out ${
            isPromptOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="h-full overflow-y-auto p-6">
            <div className="mb-4">
              <h3 className="mb-2 text-lg font-semibold text-text-primary">
                {localize('com_ui_image_details')}
              </h3>
              <div className="mb-4 h-px bg-border-medium"></div>
            </div>

            <div className="space-y-6">
              {/* Prompt Section */}
              <div>
                <h4 className="mb-2 text-sm font-medium text-text-primary">
                  {localize('com_ui_prompt')}
                </h4>
                <div className="rounded-md bg-surface-tertiary p-3">
                  <p className="text-sm leading-relaxed text-text-primary">
                    {args?.prompt || 'No prompt available'}
                  </p>
                </div>
              </div>

              {/* Generation Settings */}
              <div>
                <h4 className="mb-3 text-sm font-medium text-text-primary">
                  {localize('com_ui_generation_settings')}
                </h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-primary">{localize('com_ui_size')}:</span>
                    <span className="text-sm font-medium text-text-primary">
                      {args?.size || 'Unknown'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-primary">{localize('com_ui_quality')}:</span>
                    <span
                      className={`rounded px-2 py-1 text-xs font-medium capitalize ${
                        args?.quality === 'high'
                          ? 'bg-green-100 text-green-800'
                          : args?.quality === 'low'
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {args?.quality || 'Standard'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-primary">
                      {localize('com_ui_file_size')}:
                    </span>
                    <span className="text-sm font-medium text-text-primary">
                      {imageSize || 'Loading...'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}
