import { useGetUserBalance } from '~/data-provider/Misc/queries';

export default function CreditBalance() {
  const { data, isLoading } = useGetUserBalance();

  if (isLoading) {
    return (
      <div className="mx-2 mb-2 rounded-lg border border-border-light px-3 py-2">
        <div className="h-4 animate-pulse rounded bg-surface-tertiary" />
      </div>
    );
  }

  const credits = data?.tokenCredits ?? 0;

  return (
    <div className="mx-2 mb-2 rounded-lg border border-border-light px-3 py-2">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-text-secondary">{'Credits'}</span>
        <span className="font-medium text-text-primary">
          {credits.toLocaleString()}
        </span>
      </div>
    </div>
  );
}
