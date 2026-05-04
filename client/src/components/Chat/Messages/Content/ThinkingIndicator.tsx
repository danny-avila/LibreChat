import { memo, useEffect, useRef, useState } from 'react';

const VERBS = [
  'Thinking',
  'Pondering',
  'Reasoning',
  'Mulling',
  'Considering',
  'Reflecting',
  'Cogitating',
  'Contemplating',
  'Tinkering',
  'Marinating',
  'Brewing',
  'Percolating',
  'Ruminating',
  'Wrangling',
  'Distilling',
  'Noodling',
];

const LONGEST_VERB = VERBS.reduce((a, b) => (a.length >= b.length ? a : b));

const STARS = ['✻', '✸', '✶', '✺', '✦', '✷'];

const TYPE_MS = 60;
const HOLD_MS = 2500;
const BLANK_MS = 200;

const pickNextVerbIdx = (current: number): number => {
  if (VERBS.length <= 1) return 0;
  let next = Math.floor(Math.random() * VERBS.length);
  while (next === current) {
    next = Math.floor(Math.random() * VERBS.length);
  }
  return next;
};

const ThinkingIndicator = memo(() => {
  const [displayed, setDisplayed] = useState(VERBS[0]);
  const [isHolding, setIsHolding] = useState(true);
  const [starIdx, setStarIdx] = useState(0);
  const verbIdxRef = useRef(0);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;

    const type = (current: string, target: string) => {
      if (current === target) {
        setIsHolding(true);
        timeout = setTimeout(() => {
          setIsHolding(false);
          setDisplayed('');
          verbIdxRef.current = pickNextVerbIdx(verbIdxRef.current);
          timeout = setTimeout(() => type('', VERBS[verbIdxRef.current]), BLANK_MS);
        }, HOLD_MS);
        return;
      }
      const next = target.slice(0, current.length + 1);
      setDisplayed(next);
      timeout = setTimeout(() => type(next, target), TYPE_MS);
    };

    timeout = setTimeout(() => {
      setIsHolding(false);
      setDisplayed('');
      verbIdxRef.current = (verbIdxRef.current + 1) % VERBS.length;
      timeout = setTimeout(() => type('', VERBS[verbIdxRef.current]), BLANK_MS);
    }, HOLD_MS);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    const starInterval = setInterval(() => {
      setStarIdx((i) => (i + 1) % STARS.length);
    }, 200);
    return () => clearInterval(starInterval);
  }, []);

  return (
    <div className="group mt-3 flex w-40 items-center rounded-xl bg-surface-tertiary px-3 py-2 text-xs leading-[18px] animate-thinking-appear">
      <span className="mr-1.5 inline-block w-4 text-center text-text-secondary">
        {STARS[starIdx]}
      </span>
      <span className="grid">
        <span className="invisible col-start-1 row-start-1" aria-hidden="true">
          {LONGEST_VERB}…
        </span>
        <span className="col-start-1 row-start-1">
          {displayed}
          {isHolding ? (
            <span>…</span>
          ) : (
            <span className="ml-px inline-block w-[1px] animate-pulse">▍</span>
          )}
        </span>
      </span>
    </div>
  );
});

ThinkingIndicator.displayName = 'ThinkingIndicator';

export default ThinkingIndicator;
