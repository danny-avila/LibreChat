export default function ProgressCircle({
  radius,
  circumference,
  offset,
}: {
  radius: number;
  circumference: number;
  offset: number;
}) {
  return (
    <svg
      width="120"
      height="120"
      viewBox="0 0 120 120"
      className="absolute left-1/2 top-1/2 h-[23px] w-[23px] -translate-x-1/2 -translate-y-1/2 text-brand-purple"
    >
      <circle
        className="origin-[50%_50%] -rotate-90 stroke-brand-purple/25 dark:stroke-brand-purple/50"
        strokeWidth="7.826086956521739"
        fill="transparent"
        r={radius}
        cx="60"
        cy="60"
      />
      <circle
        className="origin-[50%_50%] -rotate-90 transition-[stroke-dashoffset]"
        stroke="currentColor"
        strokeWidth="7.826086956521739"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={offset}
        fill="transparent"
        r={radius}
        cx="60"
        cy="60"
      />
    </svg>
  );
}
