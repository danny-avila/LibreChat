import { useState, useEffect, useCallback } from 'react';
import type { TBanner } from 'librechat-data-provider';

export interface UseBannerRotationOptions {
  banners: TBanner[];
  intervalMs?: number;
  autoRotate?: boolean;
}

export interface UseBannerRotationResult {
  currentBanner: TBanner | null;
  currentIndex: number;
  nextBanner: () => void;
  previousBanner: () => void;
  goToBanner: (index: number) => void;
  pause: () => void;
  resume: () => void;
  isPaused: boolean;
}

/**
 * Hook for managing banner rotation/carousel
 */
export function useBannerRotation({
  banners,
  intervalMs = 5000,
  autoRotate = true,
}: UseBannerRotationOptions): UseBannerRotationResult {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(!autoRotate);

  const nextBanner = useCallback(() => {
    if (banners.length === 0) {
      return;
    }
    setCurrentIndex((prev) => (prev + 1) % banners.length);
  }, [banners.length]);

  const previousBanner = useCallback(() => {
    if (banners.length === 0) {
      return;
    }
    setCurrentIndex((prev) => (prev - 1 + banners.length) % banners.length);
  }, [banners.length]);

  const goToBanner = useCallback(
    (index: number) => {
      if (index >= 0 && index < banners.length) {
        setCurrentIndex(index);
      }
    },
    [banners.length],
  );

  const pause = useCallback(() => {
    setIsPaused(true);
  }, []);

  const resume = useCallback(() => {
    setIsPaused(false);
  }, []);

  // Auto-rotation effect
  useEffect(() => {
    if (!autoRotate || isPaused || banners.length <= 1) {
      return;
    }

    const timer = setInterval(nextBanner, intervalMs);

    return () => clearInterval(timer);
  }, [autoRotate, isPaused, banners.length, intervalMs, nextBanner]);

  // Reset index if banners change
  useEffect(() => {
    if (currentIndex >= banners.length) {
      setCurrentIndex(0);
    }
  }, [banners.length, currentIndex]);

  const currentBanner = banners[currentIndex] || null;

  return {
    currentBanner,
    currentIndex,
    nextBanner,
    previousBanner,
    goToBanner,
    pause,
    resume,
    isPaused,
  };
}
