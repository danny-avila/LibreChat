import { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Select,
  Button,
  Spinner,
  SelectItem,
  SelectValue,
  SelectContent,
  SelectTrigger,
  TextareaAutosize,
} from '@librechat/client';
import { QueryKeys } from 'librechat-data-provider';
import {
  useImageModels,
  useGenerateImage,
  useImageResult,
  POLL_TIMEOUT_COUNT,
} from '~/data-provider';
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
  const pollCountRef = useRef(0);

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
      pollCountRef.current = 0;
      setPredictionId(data.predictionId);
    },
    onError: () => {
      setIsGenerating(false);
      setErrorMsg(localize('com_ui_image_failed'));
    },
  });

  const pollCount = pollCountRef.current;
  const result = useImageResult(predictionId, !!predictionId, pollCount);

  useEffect(() => {
    if (result.isError) {
      setPredictionId(null);
      setIsGenerating(false);
      setErrorMsg(localize('com_ui_image_failed'));
      return;
    }
    if (!result.data) {
      return;
    }
    if (result.data.status === 'completed') {
      queryClient.invalidateQueries([QueryKeys.imageGallery]);
      setPredictionId(null);
      setIsGenerating(false);
      setErrorMsg(null);
      return;
    }
    if (result.data.status === 'failed') {
      setPredictionId(null);
      setIsGenerating(false);
      setErrorMsg(localize('com_ui_image_failed'));
      return;
    }
    pollCountRef.current += 1;
    if (pollCountRef.current >= POLL_TIMEOUT_COUNT) {
      setPredictionId(null);
      setIsGenerating(false);
      setErrorMsg(localize('com_ui_image_timeout'));
    }
  }, [result.data, result.isError, queryClient, localize]);

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
  const selectedModel = models.find((m) => m.id === (model || defaultModel));

  return (
    <div className="flex h-full flex-col items-center overflow-y-auto px-4 pb-12">
      {/* Model selector — centered at top */}
      {models.length > 0 && (
        <div className="flex w-full justify-center pt-3">
          <Select value={model || defaultModel} onValueChange={handleModelChange}>
            <SelectTrigger
              className="h-9 w-auto gap-1 border-0 bg-transparent text-base font-medium text-text-primary shadow-none hover:bg-surface-hover"
              aria-label={localize('com_ui_image_model')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-surface-secondary text-text-primary">
              {models.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Hero + composer */}
      <div className="flex w-full max-w-2xl flex-col gap-8 pt-16 md:pt-24">
        <h1 className="sr-only">{localize('com_ui_images')}</h1>
        <p className="text-center text-2xl font-semibold text-text-primary">
          {localize('com_ui_image_workspace_subtitle')}
        </p>

        {/* Composer card */}
        <div className="rounded-2xl border border-border-light bg-surface-primary p-3 shadow-sm">
          <div className="flex items-start gap-2">
            <ImageIcon
              className="mt-2.5 h-5 w-5 flex-shrink-0 text-text-tertiary"
              aria-hidden="true"
            />
            <TextareaAutosize
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={localize('com_ui_image_prompt_placeholder')}
              aria-label={localize('com_ui_image_prompt_placeholder')}
              className="min-h-[40px] w-full resize-none bg-transparent py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
              minRows={1}
              maxRows={8}
            />
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            {models.length > 0 ? (
              <ImageControls
                selectedModel={selectedModel}
                aspectRatio={aspectRatio}
                aspectRatios={aspectRatios}
                param={param}
                imageUrls={imageUrls}
                onAspectRatioChange={setAspectRatio}
                onParamChange={setParam}
                onImageUrlsChange={setImageUrls}
                onUploadStart={() => setIsUploading(true)}
                onUploadEnd={() => setIsUploading(false)}
                isUploading={isUploading}
              />
            ) : (
              <span />
            )}

            <Button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim() || isUploading}
              className="flex-shrink-0 rounded-full"
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
          </div>
        </div>

        {/* Error message */}
        {errorMsg && (
          <p role="alert" className="text-center text-sm text-red-500">
            {errorMsg}
          </p>
        )}
      </div>

      {/* Gallery */}
      <div className="mt-12 w-full max-w-2xl">
        <ImageGallery />
      </div>
    </div>
  );
}
