import { useEffect, useMemo, useState, useRef } from 'react';
import { processMermaidSvg } from '~/utils/diagram/export';
import { useDebouncedMermaid } from '~/hooks';

const MIN_CONTAINER_HEIGHT = 200;
const MAX_CONTAINER_HEIGHT = 500;

interface UseSvgProcessingOptions {
  content: string;
  id?: string;
  theme?: string;
  retryCount: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export default function useSvgProcessing({
  content,
  id,
  theme,
  retryCount,
  containerRef,
}: UseSvgProcessingOptions) {
  const [blobUrl, setBlobUrl] = useState('');
  const [svgDimensions, setSvgDimensions] = useState<{ width: number; height: number } | null>(
    null,
  );
  const [containerWidth, setContainerWidth] = useState(700);
  const lastValidSvgRef = useRef<string | null>(null);
  const lastProcessedSvgRef = useRef<string | null>(null);

  const { svg, isLoading, error } = useDebouncedMermaid({
    content,
    id,
    theme,
    key: retryCount,
  });

  useEffect(() => {
    if (svg) {
      lastValidSvgRef.current = svg;
    }
  }, [svg]);

  /* The canvas only mounts once there is a diagram to show, so the first run
   * of this effect sees a null ref while the placeholder is up. Re-running it
   * on `blobUrl` picks the real element up; without that, the fit calculation
   * below keeps the default width and clips wide diagrams in narrow panels. */
  useEffect(() => {
    if (!containerRef.current) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [containerRef, blobUrl]);

  const { svg: processedSvg, dimensions: parsedDimensions } = useMemo(() => {
    if (!svg) {
      return { svg: null, dimensions: null };
    }
    return processMermaidSvg(svg);
  }, [svg]);
  if (processedSvg) {
    lastProcessedSvgRef.current = processedSvg;
  }

  useEffect(() => {
    if (parsedDimensions) {
      setSvgDimensions(parsedDimensions);
    }
  }, [parsedDimensions]);

  useEffect(() => {
    if (!processedSvg) {
      return;
    }
    const blob = new Blob([processedSvg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    setBlobUrl(url);
  }, [processedSvg]);

  useEffect(() => {
    if (!blobUrl) {
      return;
    }
    return () => URL.revokeObjectURL(blobUrl);
  }, [blobUrl]);

  const { initialScale, calculatedHeight } = useMemo(() => {
    if (!svgDimensions) {
      return { initialScale: 1, calculatedHeight: MAX_CONTAINER_HEIGHT };
    }
    const padding = 32;
    const availableWidth = containerWidth - padding;
    const scaleX = availableWidth / svgDimensions.width;
    const scaleY = MAX_CONTAINER_HEIGHT / svgDimensions.height;
    const scale = Math.min(scaleX, scaleY, 1);
    const height = Math.max(
      MIN_CONTAINER_HEIGHT,
      Math.min(MAX_CONTAINER_HEIGHT, svgDimensions.height * scale + padding),
    );
    return { initialScale: scale, calculatedHeight: height };
  }, [svgDimensions, containerWidth]);

  return {
    blobUrl,
    processedSvg: processedSvg ?? lastProcessedSvgRef.current,
    svgDimensions,
    isLoading,
    error,
    lastValidSvgRef,
    initialScale,
    calculatedHeight,
  };
}
