import { useEffect, useMemo, useState, useRef } from 'react';
import { useDebouncedMermaid } from '~/hooks';
import { fixSubgraphTitleContrast } from '~/utils/mermaid';

const MIN_CONTAINER_HEIGHT = 200;
const MAX_CONTAINER_HEIGHT = 500;

interface UseSvgProcessingOptions {
  content: string;
  id?: string;
  theme?: string;
  retryCount: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

function applyFallbackFixes(svgString: string): string {
  let finalSvg = svgString;

  if (
    !svgString.includes('viewBox') &&
    svgString.includes('height=') &&
    svgString.includes('width=')
  ) {
    const widthMatch = svgString.match(/width="(\d+)"/);
    const heightMatch = svgString.match(/height="(\d+)"/);
    if (widthMatch && heightMatch) {
      finalSvg = finalSvg.replace('<svg', `<svg viewBox="0 0 ${widthMatch[1]} ${heightMatch[1]}"`);
    }
  }

  if (!finalSvg.includes('xmlns')) {
    finalSvg = finalSvg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  return finalSvg;
}

function processSvgString(svg: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svg, 'image/svg+xml');

  if (doc.querySelector('parsererror')) {
    return { processedSvg: applyFallbackFixes(svg), parsedDimensions: null };
  }

  const svgElement = doc.querySelector('svg');
  if (!svgElement) {
    return { processedSvg: applyFallbackFixes(svg), parsedDimensions: null };
  }

  let width = parseFloat(svgElement.getAttribute('width') || '0');
  let height = parseFloat(svgElement.getAttribute('height') || '0');

  if (!width || !height) {
    const viewBox = svgElement.getAttribute('viewBox');
    if (viewBox) {
      const parts = viewBox.split(/[\s,]+/).map(Number);
      if (parts.length === 4) {
        width = parts[2];
        height = parts[3];
      }
    }
  }

  let dimensions: { width: number; height: number } | null = null;
  if (width > 0 && height > 0) {
    dimensions = { width, height };
    if (!svgElement.getAttribute('viewBox')) {
      svgElement.setAttribute('viewBox', `0 0 ${width} ${height}`);
    }
    svgElement.removeAttribute('width');
    svgElement.removeAttribute('height');
    svgElement.removeAttribute('style');
  }

  if (!svgElement.getAttribute('xmlns')) {
    svgElement.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }

  fixSubgraphTitleContrast(svgElement);

  return {
    processedSvg: new XMLSerializer().serializeToString(doc),
    parsedDimensions: dimensions,
  };
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
  }, [containerRef]);

  const { processedSvg, parsedDimensions } = useMemo(() => {
    if (!svg) {
      return { processedSvg: null, parsedDimensions: null };
    }
    return processSvgString(svg);
  }, [svg]);

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
    return () => URL.revokeObjectURL(url);
  }, [processedSvg]);

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
    svgDimensions,
    isLoading,
    error,
    lastValidSvgRef,
    initialScale,
    calculatedHeight,
  };
}
