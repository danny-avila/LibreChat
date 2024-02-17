import CancelledIcon from './CancelledIcon';

export default function InProgressCall({
  error,
  isSubmitting,
  progress,
  children,
}: {
  error?: boolean;
  isSubmitting: boolean;
  progress: number;
  children: React.ReactNode;
}) {
  if ((!isSubmitting && progress < 1) || error) {
    return <CancelledIcon />;
  }

  return <>{children}</>;
}
