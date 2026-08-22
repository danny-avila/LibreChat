import { Button, EmptyState } from '@librechat/client';
import { CalendarClock, TriangleAlert } from 'lucide-react';
import { useLocalize } from '~/hooks';

interface ScheduleEmptyStateProps {
  isError?: boolean;
  onRetry?: () => void;
}

export default function ScheduleEmptyState({ isError = false, onRetry }: ScheduleEmptyStateProps) {
  const localize = useLocalize();

  if (isError) {
    return (
      <EmptyState
        icon={TriangleAlert}
        title={localize('com_ui_schedules_error')}
        action={
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            {localize('com_ui_retry')}
          </Button>
        }
      />
    );
  }

  return (
    <EmptyState
      icon={CalendarClock}
      title={localize('com_ui_no_schedules_title')}
      description={localize('com_ui_no_schedules')}
    />
  );
}
