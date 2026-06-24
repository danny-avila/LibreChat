import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Spinner, Button, TextareaAutosize } from '@librechat/client';
import { QueryKeys } from 'librechat-data-provider';
import { useImageModels, useGenerateImage, useImageResult } from '~/data-provider';
import { useLocalize } from '~/hooks';
import ImageControls from './ImageControls';
import ImageGallery from './ImageGallery';

export default function ImageWorkspace() {
  const localize = useLocalize();
  const queryClient = useQueryClient();

  const { data: config } = useImageModels();

  const defaultModel = config?.default ?? '';
  const defaultAspectRatio = config?.aspectRatios?.[0] ?? '1:1';

  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [param, setParam] = useState('');
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [predictionId, setPredictionId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync model/param defaults once config loads
  useEffect(() => {
    if (config && !model) {
      setModel(config.default);
      const found = config.models.find((m) => m.id === config.default);
      setParam(found?.defaultParam ?? '');
    }
    if (
      config &&
      aspectRatio === '1:1' &&
      config.aspectRatios.length > 0 &&
      !config.aspectRatios.includes('1:1')
    ) {
      setAspectRatio(defaultAspectRatio);
    }
  }, [config, model, aspectRatio, defaultAspectRatio]);

  const handleModelChange = (value: string) => {
    setModel(value);
    const found = config?.models.find((m) => m.id === value);
    setParam(found?.defaultParam ?? '');
    setImageUrls([]);
  };

  const { mutate: generateImage } = useGenerateImage({
    onSuccess: (data) => {
      setPredictionId(data.predictionId);
    },
    onError: () => {
      setIsGenerating(false);
      setErrorMsg(localize('com_ui_image_failed'));
    },
  });

  const result = useImageResult(predictionId, !!predictionId);

  useEffect(() => {
    if (!result.data) {
      return;
    }
    if (result.data.status === 'completed') {
      queryClient.invalidateQueries([QueryKeys.imageGallery]);
      setPredictionId(null);
      setIsGenerating(false);
      setErrorMsg(null);
    } else if (result.data.status === 'failed') {
      setPredictionId(null);
      setIsGenerating(false);
      setErrorMsg(localize('com_ui_image_failed'));
    }
  }, [result.data, queryClient, localize]);

  const handleGenerate = () => {
    if (!prompt.trim() || isGenerating) {
      return;
    }
    setErrorMsg(null);
    setIsGenerating(true);
    generateImage({
      prompt: prompt.trim(),
      model,
      aspectRatio,
      param: param || undefined,
      imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    });
  };

  const models = config?.models ?? [];
  const aspectRatios = config?.aspectRatios ?? ['1:1'];

  return (
    <div className="flex h-full flex-col items-center px-4 py-8">
      <div className="w-full max-w-2xl space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">{localize('com_ui_images')}</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {localize('com_ui_image_workspace_subtitle')}
          </p>
        </div>

        {/* Prompt textarea */}
        <div className="space-y-2">
          <TextareaAutosize
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={localize('com_ui_image_prompt_placeholder')}
            aria-label={localize('com_ui_image_prompt_placeholder')}
            className="min-h-[100px] w-full resize-none rounded-lg border border-gray-200 bg-transparent p-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none dark:border-gray-600"
            minRows={3}
            maxRows={8}
          />
        </div>

        {/* Controls */}
        {models.length > 0 && (
          <ImageControls
            models={models}
            model={model || defaultModel}
            aspectRatio={aspectRatio}
            aspectRatios={aspectRatios}
            param={param}
            imageUrls={imageUrls}
            onModelChange={handleModelChange}
            onAspectRatioChange={setAspectRatio}
            onParamChange={setParam}
            onImageUrlsChange={setImageUrls}
            onUploadStart={() => setIsUploading(true)}
            onUploadEnd={() => setIsUploading(false)}
            isUploading={isUploading}
          />
        )}

        {/* Generate button */}
        <Button
          type="button"
          onClick={handleGenerate}
          disabled={isGenerating || !prompt.trim() || isUploading}
          className="w-full"
          aria-label={localize('com_ui_generate')}
        >
          {isGenerating ? (
            <span className="flex items-center gap-2">
              <Spinner className="h-4 w-4" />
              {localize('com_ui_image_generating')}
            </span>
          ) : (
            localize('com_ui_generate')
          )}
        </Button>

        {/* Error message */}
        {errorMsg && (
          <p role="alert" className="text-sm text-red-500">
            {errorMsg}
          </p>
        )}
      </div>

      <div className="mt-10 w-full max-w-2xl">
        <ImageGallery />
      </div>
    </div>
  );
}
