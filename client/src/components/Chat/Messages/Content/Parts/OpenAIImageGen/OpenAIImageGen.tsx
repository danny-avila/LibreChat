import { useState, useEffect, useRef, useCallback } from 'react';
import { PixelCard } from '@librechat/client';
import type { TAttachment, TFile, TAttachmentMetadata } from 'librechat-data-provider';
import Image from '~/components/Chat/Messages/Content/Image';
import ProgressText from './ProgressText';
import { scaleImage } from '~/utils';

export default function OpenAIImageGen({
  initialProgress = 0.1,
  isSubmitting,
  toolName,
  args: _args = '',
  output,
  attachments,
}: {
  initialProgress: number;
  isSubmitting: boolean;
  toolName: string;
  args: string | Record<string, unknown>;
  output?: string | null;
  attachments?: TAttachment[];
}) {
  const [progress, setProgress] = useState(initialProgress);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const error =
    typeof output === 'string' && output.toLowerCase().includes('error processing tool');

  const cancelled = (!isSubmitting && initialProgress < 1) || error === true;

  let width: number | undefined;
  let height: number | undefined;
  let quality: 'low' | 'medium' | 'high' = 'high';

  // Parse args if it's a string
  let parsedArgs;
  try {
    parsedArgs = typeof _args === 'string' ? JSON.parse(_args) : _args;
  } catch (error) {
    console.error('Error parsing args:', error);
    parsedArgs = {};
  }

  try {
    const argsObj = parsedArgs;

    if (argsObj && typeof argsObj.size === 'string') {
      const [w, h] = argsObj.size.split('x').map((v: string) => parseInt(v, 10));
      if (!isNaN(w) && !isNaN(h)) {
        width = w;
        height = h;
      }
    } else if (argsObj && (typeof argsObj.size !== 'string' || !argsObj.size)) {
      width = undefined;
      height = undefined;
    }

    if (argsObj && typeof argsObj.quality === 'string') {
      const q = argsObj.quality.toLowerCase();
      if (q === 'low' || q === 'medium' || q === 'high') {
        quality = q;
      }
    }
  } catch (e) {
    width = undefined;
    height = undefined;
  }

  // Default to 1024x1024 if width and height are still undefined after parsing args and attachment metadata
  const attachment = attachments?.[0];
  const {
    width: imageWidth,
    height: imageHeight,
    filepath = null,
    filename = '',
  } = (attachment as TFile & TAttachmentMetadata) || {};

  let origWidth = width ?? imageWidth;
  let origHeight = height ?? imageHeight;

  if (origWidth === undefined || origHeight === undefined) {
    origWidth = 1024;
    origHeight = 1024;
  }

  const [dimensions, setDimensions] = useState({ width: 'auto', height: 'auto' });
  const containerRef = useRef<HTMLDivElement>(null);

  const updateDimensions = useCallback(() => {
    if (origWidth && origHeight && containerRef.current) {
      const scaled = scaleImage({
        originalWidth: origWidth,
        originalHeight: origHeight,
        containerRef,
      });
      setDimensions(scaled);
    }
  }, [origWidth, origHeight]);

  useEffect(() => {
    if (isSubmitting) {
      setProgress(initialProgress);

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }

      let baseDuration = 20000;
      if (quality === 'low') {
        baseDuration = 10000;
      } else if (quality === 'high') {
        baseDuration = 50000;
      }
      // adding some jitter (±30% of base)
      const jitter = Math.floor(baseDuration * 0.3);
      const totalDuration = Math.floor(Math.random() * jitter) + baseDuration;
      const updateInterval = 200;
      const totalSteps = totalDuration / updateInterval;
      let currentStep = 0;

      intervalRef.current = setInterval(() => {
        currentStep++;

        if (currentStep >= totalSteps) {
          clearInterval(intervalRef.current as NodeJS.Timeout);
          setProgress(0.9);
        } else {
          const progressRatio = currentStep / totalSteps;
          let mapRatio: number;
          if (progressRatio < 0.8) {
            mapRatio = Math.pow(progressRatio, 1.1);
          } else {
            const sub = (progressRatio - 0.8) / 0.2;
            mapRatio = 0.8 + (1 - Math.pow(1 - sub, 2)) * 0.2;
          }
          const scaledProgress = 0.1 + mapRatio * 0.8;

          setProgress(scaledProgress);
        }
      }, updateInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isSubmitting, initialProgress, quality]);

  useEffect(() => {
    if (initialProgress >= 1 || cancelled) {
      setProgress(initialProgress);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }
  }, [initialProgress, cancelled]);

  useEffect(() => {
    updateDimensions();

    const resizeObserver = new ResizeObserver(() => {
      updateDimensions();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [updateDimensions]);

  return (
    <>
      <div className="relative my-2.5 flex size-5 shrink-0 items-center gap-2.5">
        <ProgressText progress={progress} error={cancelled} toolName={toolName} />
      </div>
      <div className="relative mb-2 flex w-full justify-start">
        <div ref={containerRef} className="w-full max-w-lg">
          {dimensions.width !== 'auto' && progress < 1 && (
            <PixelCard
              variant="default"
              progress={progress}
              randomness={0.6}
              width={dimensions.width}
              height={dimensions.height}
            />
          )}
          <Image
            altText={filename}
            imagePath={filepath ?? ''}
            width={Number(dimensions.width?.split('px')[0])}
            height={Number(dimensions.height?.split('px')[0])}
            placeholderDimensions={{ width: dimensions.width, height: dimensions.height }}
            args={parsedArgs}
          />
        </div>
      </div>
    </>
  );
}
