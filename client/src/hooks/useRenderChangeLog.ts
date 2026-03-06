import { useEffect, useRef } from 'react';

type RenderLogValues = Record<string, unknown>;

type DebugWindow = Window & {
  __LC_RENDER_DEBUG__?: boolean;
};

/** Logs which tracked values changed between renders when debug flag is enabled. */
export default function useRenderChangeLog(name: string, values: RenderLogValues) {
  const previousValuesRef = useRef<RenderLogValues | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !(window as DebugWindow).__LC_RENDER_DEBUG__) {
      previousValuesRef.current = values;
      return;
    }

    if (previousValuesRef.current == null) {
      console.log(`[render-debug] ${name}: initial render`, values);
      previousValuesRef.current = values;
      return;
    }

    const previousValues = previousValuesRef.current;
    const changedEntries = Object.entries(values).filter(
      ([key, value]) => !Object.is(previousValues[key], value),
    );

    if (changedEntries.length > 0) {
      console.log(
        `[render-debug] ${name}`,
        Object.fromEntries(
          changedEntries.map(([key, value]) => [
            key,
            {
              previous: previousValues[key],
              next: value,
            },
          ]),
        ),
      );
    } else {
      console.log(`[render-debug] ${name}: parent-driven render`);
    }

    previousValuesRef.current = values;
  });
}
