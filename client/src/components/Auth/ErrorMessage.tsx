export const ErrorMessage = ({ children }: { children: React.ReactNode }) => (
  <div
    role="alert"
    aria-live="assertive"
    className="relative mt-6 rounded-lg border border-red-500/20 bg-red-50/50 px-6 py-4 text-red-700 shadow-2xs transition-all dark:bg-red-950/30 dark:text-red-100"
  >
    {children}
  </div>
);
