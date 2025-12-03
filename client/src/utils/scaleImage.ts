export default function scaleImage({
  originalWidth,
  originalHeight,
  containerRef,
}: {
  originalWidth?: number;
  originalHeight?: number;
  containerRef: React.RefObject<HTMLDivElement>;
}) {
  const containerWidth = containerRef.current?.offsetWidth ?? 0;

  if (containerWidth === 0 || originalWidth == null || originalHeight == null) {
    return { width: 'auto', height: 'auto' };
  }

  const aspectRatio = originalWidth / originalHeight;
  const scaledWidth = Math.min(containerWidth, originalWidth);
  const scaledHeight = scaledWidth / aspectRatio;

  return { width: `${scaledWidth}px`, height: `${scaledHeight}px` };
}
