// Container Component
const Container = ({ children }: { children: React.ReactNode }) => (
  <div className="text-message flex w-[calc(100%-50px)] lg:w-[calc(100%-80px)] min-h-[20px] flex-col items-start gap-3 overflow-x-auto [.text-message+&]:mt-5">
    {children}
  </div>
);

export default Container;
