import ProgressCircle from './ProgressCircle';
import InProgressCall from './InProgressCall';
import RetrievalIcon from './RetrievalIcon';
import CancelledIcon from './CancelledIcon';
import ProgressText from './ProgressText';
import FinishedIcon from './FinishedIcon';
import { useProgress } from '~/hooks';

export default function RetrievalCall({
  initialProgress = 0.1,
  isSubmitting,
}: {
  initialProgress: number;
  isSubmitting: boolean;
}) {
  const progress = useProgress(initialProgress);
  const radius = 56.08695652173913;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - progress * circumference;
  const error = progress >= 2;

  return (
    <div className="my-2.5 flex items-center gap-2.5">
      <div className="relative h-5 w-5 shrink-0">
        {progress < 1 ? (
          <InProgressCall progress={progress} isSubmitting={isSubmitting} error={error}>
            <div
              className="absolute left-0 top-0 flex h-full w-full items-center justify-center rounded-full bg-transparent text-white"
              style={{ opacity: 1, transform: 'none' }}
            >
              <div>
                <RetrievalIcon />
              </div>
              <ProgressCircle radius={radius} circumference={circumference} offset={offset} />
            </div>
          </InProgressCall>
        ) : error ? (
          <CancelledIcon />
        ) : (
          <FinishedIcon />
        )}
      </div>
      <ProgressText
        progress={progress}
        onClick={() => ({})}
        inProgressText={'Searching my knowledge'}
        finishedText={'Used Retrieval'}
        hasInput={false}
        popover={false}
      />
    </div>
  );
}
