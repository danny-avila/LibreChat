// Container Component
const Container = ({ children }: { children: React.ReactNode }) => (
  <div className="text-message peer flex min-h-[20px] flex-col items-start gap-3 overflow-x-auto break-words peer-[.text-message]:mt-5">
    {children}
  </div>
);

export default Container;
