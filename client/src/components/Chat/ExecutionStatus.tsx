import { useEffect, useRef, useState } from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { useRecoilValue } from 'recoil';
import { FEATURES } from './featureConfig';
import store from '~/store';

const FEATURE_STEPS: Record<string, string[]> = {
  agent: [
    'Analyzing task requirements...',
    'Planning execution strategy...',
    'Running agent pipeline...',
    'Processing results...',
  ],
  slides: [
    'Analyzing topic...',
    'Structuring presentation...',
    'Generating slide content...',
    'Applying design...',
  ],
  sheets: [
    'Understanding data requirements...',
    'Structuring spreadsheet...',
    'Generating formulas & data...',
    'Formatting output...',
  ],
  docs: [
    'Analyzing requirements...',
    'Structuring document...',
    'Writing content...',
    'Formatting document...',
  ],
  dev: [
    'Understanding requirements...',
    'Planning architecture...',
    'Writing code...',
    'Reviewing output...',
  ],
  chat: [
    'Understanding your question...',
    'Generating response...',
  ],
  image: [
    'Interpreting your description...',
    'Generating image...',
    'Enhancing details...',
  ],
  video: [
    'Analyzing your prompt...',
    'Planning video sequence...',
    'Rendering video...',
  ],
  music: [
    'Interpreting music style...',
    'Composing melody...',
    'Arranging instruments...',
    'Mixing & mastering...',
  ],
  mail: [
    'Reading email context...',
    'Composing response...',
  ],
};

const STEP_DURATION = 3000;

export default function ExecutionStatus({ isSubmitting }: { isSubmitting: boolean }) {
  const activeFeature = useRecoilValue(store.activeFeature);
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const steps = activeFeature ? FEATURE_STEPS[activeFeature] || FEATURE_STEPS.chat : null;
  const featureColor = activeFeature ? FEATURES[activeFeature]?.color : null;

  useEffect(() => {
    if (!isSubmitting || !steps) {
      setCurrentStep(0);
      setCompletedSteps([]);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    setCurrentStep(0);
    setCompletedSteps([]);

    timerRef.current = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev < steps.length - 1) {
          setCompletedSteps((c) => [...c, prev]);
          return prev + 1;
        }
        return prev;
      });
    }, STEP_DURATION);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isSubmitting, steps]);

  if (!isSubmitting || !activeFeature || !steps || !featureColor) {
    return null;
  }

  return (
    <div className="mx-auto mb-2 flex w-full max-w-3xl flex-col gap-1 px-4">
      <div
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
        style={{
          backgroundColor: `var(--feature-${featureColor})`,
          color: `var(--feature-${featureColor}-icon)`,
        }}
      >
        <Loader2 size={14} className="animate-spin" />
        <span className="font-medium">{steps[currentStep]}</span>
      </div>
      {completedSteps.length > 0 && (
        <div className="flex flex-col gap-0.5 px-1">
          {completedSteps.map((stepIdx) => (
            <div
              key={stepIdx}
              className="flex items-center gap-1.5 text-[10px] text-text-tertiary"
            >
              <CheckCircle2 size={10} className="text-green-500" />
              <span>{steps[stepIdx]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
