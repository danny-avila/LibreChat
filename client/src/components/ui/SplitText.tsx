import { useSprings, animated, SpringConfig } from '@react-spring/web';
import { useEffect, useRef, useState } from 'react';

interface SplitTextProps {
  text?: string;
  className?: string;
  delay?: number;
  animationFrom?: { opacity: number; transform: string };
  animationTo?: { opacity: number; transform: string };
  easing?: SpringConfig['easing'];
  threshold?: number;
  rootMargin?: string;
  textAlign?: 'left' | 'right' | 'center' | 'justify' | 'start' | 'end';
  onLetterAnimationComplete?: () => void;
  onLineCountChange?: (lineCount: number) => void;
}

// ฟังก์ชันเพื่อตรวจสอบว่าเป็นตัวอักษรไทยหรือไม่
const isThaiText = (text: string): boolean => {
  // ดักจับตัวอักษรในช่วง Unicode ของภาษาไทย (0E00-0E7F)
  const thaiPattern = /[\u0E00-\u0E7F]/;
  return thaiPattern.test(text);
};

const SplitText: React.FC<SplitTextProps> = ({
  text = '',
  className = '',
  delay = 100,
  animationFrom = { opacity: 0, transform: 'translate3d(0,40px,0)' },
  animationTo = { opacity: 1, transform: 'translate3d(0,0,0)' },
  easing = (t: number) => t,
  threshold = 0.1,
  rootMargin = '-100px',
  textAlign = 'center',
  onLetterAnimationComplete,
  onLineCountChange,
}) => {
  const isThai = isThaiText(text);
  
  // ถ้าเป็นข้อความภาษาไทย จะจัดการแบบคำ ไม่ใช่ตัวอักษร
  const useWords = isThai;
  
  // แยกเป็นคำหรือตัวอักษรตามความเหมาะสม
  const words = text.split(' ');
  const letters = useWords ? words : words.map((word) => word.split('')).flat();
  
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);
  const animatedCount = useRef(0);

  const springs = useSprings(
    letters.length,
    letters.map((_, i) => ({
      from: animationFrom,
      to: inView
        ? async (next: (props: any) => Promise<void>) => {
          await next(animationTo);
          animatedCount.current += 1;
          if (animatedCount.current === letters.length && onLetterAnimationComplete) {
            onLetterAnimationComplete();
          }
        }
        : animationFrom,
      delay: i * delay,
      config: { easing },
    })),
  );

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (ref.current) {
            observer.unobserve(ref.current);
          }
        }
      },
      { threshold, rootMargin },
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [threshold, rootMargin]);

  useEffect(() => {
    if (ref.current && inView) {
      const element = ref.current;
      setTimeout(() => {
        const lineHeight =
          parseInt(getComputedStyle(element).lineHeight) ||
          parseInt(getComputedStyle(element).fontSize) * 1.2;
        const height = element.offsetHeight;
        const lines = Math.round(height / lineHeight);

        if (onLineCountChange) {
          onLineCountChange(lines);
        }
      }, 100);
    }
  }, [inView, text, onLineCountChange]);

  // ถ้าเป็นภาษาไทย ใช้ animation แบบคำ
  if (isThai) {
    return (
      <p
        ref={ref}
        className={`split-parent inline overflow-hidden ${className}`}
        style={{ textAlign, whiteSpace: 'normal', wordWrap: 'break-word' }}
        lang="th"
      >
        {words.map((word, wordIndex) => {
          const index = wordIndex;
          return (
            <animated.span
              key={index}
              style={springs[index] as unknown as React.CSSProperties}
              className="inline-block transform transition-opacity will-change-transform thai-text"
            >
              {word}
              {wordIndex < words.length - 1 && (
                <span style={{ display: 'inline-block', width: '0.3em' }}>&nbsp;</span>
              )}
            </animated.span>
          );
        })}
      </p>
    );
  }

  // ถ้าไม่ใช่ภาษาไทย ใช้โค้ดเดิม
  return (
    <p
      ref={ref}
      className={`split-parent inline overflow-hidden ${className}`}
      style={{ textAlign, whiteSpace: 'normal', wordWrap: 'break-word' }}
    >
      {words.map((word, wordIndex) => (
        <span key={wordIndex} style={{ display: 'inline-block', whiteSpace: 'nowrap' }}>
          {word.split('').map((letter, letterIndex) => {
            const index =
              words.slice(0, wordIndex).reduce((acc, w) => acc + w.length, 0) + letterIndex;

            return (
              <animated.span
                key={index}
                style={springs[index] as unknown as React.CSSProperties}
                className="inline-block transform transition-opacity will-change-transform"
              >
                {letter}
              </animated.span>
            );
          })}
          {wordIndex < words.length - 1 && (
            <span style={{ display: 'inline-block', width: '0.3em' }}>&nbsp;</span>
          )}
        </span>
      ))}
    </p>
  );
};

export default SplitText;