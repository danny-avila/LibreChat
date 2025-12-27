import { useEffect, useState, useRef, useMemo } from 'react';
import DOMPurify from 'dompurify';
import mermaid from 'mermaid';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { useTheme, Button, TooltipAnchor } from '@librechat/client';
import { Maximize2, ZoomIn, ZoomOut, RotateCcw, Copy, Check } from 'lucide-react';
import DialogMermaid from './DialogMermaid';
import { useLocalize } from '~/hooks';

interface MermaidDiagramProps {
  code: string;
}

const MIN_HEIGHT = 50;
const MAX_HEIGHT = 800;
const DEBOUNCE_MS = 100;

const getSvgDimensions = (svgElement: SVGSVGElement): { width: number; height: number } | null => {
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

  return width && height ? { width, height } : null;
};

// Converts fixed SVG attributes to CSS styles. Necessary for proper scaling with react-zoom-pan-pinch.
const prepareSvgForScaling = (
  svgElement: SVGSVGElement,
  dimensions: { width: number; height: number },
) => {
  if (!svgElement.getAttribute('viewBox')) {
    svgElement.setAttribute('viewBox', `0 0 ${dimensions.width} ${dimensions.height}`);
  }
  svgElement.removeAttribute('width');
  svgElement.removeAttribute('height');
  svgElement.style.width = `${dimensions.width}px`;
  svgElement.style.height = `${dimensions.height}px`;
};

export const MermaidDiagram = ({ code }: MermaidDiagramProps) => {
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [containerWidth, setContainerWidth] = useState(700);
  const [isHovered, setIsHovered] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [isPanning, setIsPanning] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const theme = useTheme();
  const darkModeEnabled = theme.theme === 'dark';
  const localize = useLocalize();

  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  const handleCopy = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      mermaid.initialize({
        startOnLoad: false,
        theme: darkModeEnabled ? 'dark' : 'default',
        securityLevel: 'strict',
        suppressErrorRendering: true,
      });

      try {
        await mermaid.parse(code);

        const uniqueId = `mermaid-${Math.random().toString(36).slice(2)}`;
        let { svg } = await mermaid.render(uniqueId, code);

        svg = svg.replace(/xlink:href/g, 'href'); // Convert xlink:href to href for React compatibility

        const parser = new DOMParser();
        const doc = parser.parseFromString(svg, 'image/svg+xml');
        const svgElement = doc.querySelector('svg');

        let svgToSanitize = svg;

        if (svgElement) {
          const dimensions = getSvgDimensions(svgElement);
          if (dimensions) {
            prepareSvgForScaling(svgElement, dimensions);
          }
          setDimensions(dimensions);
          svgToSanitize = new XMLSerializer().serializeToString(doc);
        }

        const sanitized = DOMPurify.sanitize(svgToSanitize, {
          USE_PROFILES: { svg: true, svgFilters: true },
          ADD_TAGS: ['foreignObject'],
          ADD_ATTR: ['requiredExtensions'],
        });
        setSvgContent(sanitized);
      } catch {
        setSvgContent(null);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [code, darkModeEnabled]);

  const { initialScale, containerHeight } = useMemo(() => {
    if (!dimensions) {
      return { initialScale: 1, containerHeight: MAX_HEIGHT };
    }

    const scaleX = containerWidth / dimensions.width;
    const scaleY = MAX_HEIGHT / dimensions.height;
    const scale = Math.min(scaleX, scaleY, 1);
    const containerHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, dimensions.height * scale));

    return { initialScale: scale, containerHeight: containerHeight };
  }, [dimensions, containerWidth]);

  const showControls = isHovered || isTouchDevice;

  if (!svgContent) {
    return <code className="text-sm text-gray-800 dark:text-gray-200">{code}</code>;
  }

  return (
    <>
      <div
        ref={containerRef}
        className="relative my-4 overflow-hidden rounded-2xl border border-transparent bg-white transition-colors duration-200 hover:border-gray-100 dark:border-transparent dark:bg-gray-800 dark:hover:border-gray-700"
        style={{ height: containerHeight }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <TransformWrapper
          key={`${code}-${initialScale}`}
          initialScale={initialScale}
          minScale={0.05}
          maxScale={10}
          centerOnInit={true}
          limitToBounds={false}
          wheel={{ step: 0.1 }}
          onPanningStart={() => setIsPanning(true)}
          onPanningStop={() => setIsPanning(false)}
        >
          {({ zoomIn, zoomOut, centerView }) => (
            <>
              <div
                className={`absolute right-3 top-3 z-10 flex items-center gap-1 transition-opacity duration-200 ${showControls ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
              >
                <TooltipAnchor
                  description={localize('com_ui_zoom_in')}
                  render={
                    <Button
                      variant="outline"
                      className="h-9 w-9 bg-white p-0 dark:bg-gray-800"
                      onClick={() => zoomIn()}
                      aria-label={localize('com_ui_zoom_in')}
                    >
                      <ZoomIn className="size-4" aria-hidden="true" />
                    </Button>
                  }
                />
                <TooltipAnchor
                  description={localize('com_ui_zoom_out')}
                  render={
                    <Button
                      variant="outline"
                      className="h-9 w-9 bg-white p-0 dark:bg-gray-800"
                      onClick={() => zoomOut()}
                      aria-label={localize('com_ui_zoom_out')}
                    >
                      <ZoomOut className="size-4" aria-hidden="true" />
                    </Button>
                  }
                />
                <TooltipAnchor
                  description={localize('com_ui_reset_zoom')}
                  render={
                    <Button
                      variant="outline"
                      className="h-9 w-9 bg-white p-0 dark:bg-gray-800"
                      onClick={() => centerView(initialScale)}
                      aria-label={localize('com_ui_reset_zoom')}
                    >
                      <RotateCcw className="size-4" aria-hidden="true" />
                    </Button>
                  }
                />
                <TooltipAnchor
                  description={localize('com_ui_expand')}
                  render={
                    <Button
                      variant="outline"
                      className="h-9 w-9 bg-white p-0 dark:bg-gray-800"
                      onClick={() => setIsFullscreenOpen(true)}
                      aria-label={localize('com_ui_expand')}
                    >
                      <Maximize2 className="size-4" aria-hidden="true" />
                    </Button>
                  }
                />
                <TooltipAnchor
                  description={copied ? localize('com_ui_copied') : localize('com_ui_copy_code')}
                  render={
                    <Button
                      variant="outline"
                      className="h-9 w-9 bg-white p-0 dark:bg-gray-800"
                      onClick={handleCopy}
                      aria-label={copied ? localize('com_ui_copied') : localize('com_ui_copy_code')}
                    >
                      {copied ? (
                        <Check className="size-4" aria-hidden="true" />
                      ) : (
                        <Copy className="size-4" aria-hidden="true" />
                      )}
                    </Button>
                  }
                />
              </div>

              <TransformComponent
                wrapperStyle={{
                  width: '100%',
                  height: '100%',
                  cursor: isPanning ? 'grabbing' : 'grab',
                }}
                contentStyle={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {/* SVG content is sanitized by mermaid securityLevel: 'strict' + DOMPurify */}
                <div dangerouslySetInnerHTML={{ __html: svgContent }} />
              </TransformComponent>
            </>
          )}
        </TransformWrapper>
      </div>

      <DialogMermaid
        isOpen={isFullscreenOpen}
        onOpenChange={setIsFullscreenOpen}
        svgContent={svgContent}
        code={code}
        dimensions={dimensions}
      />
    </>
  );
};
