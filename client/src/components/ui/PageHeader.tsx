interface PageHeaderProps {
  title: string;
  actions?: React.ReactNode;
}

export default function PageHeader({ title, actions }: PageHeaderProps) {
  return (
    <div className="relative w-full flex-shrink-0">
      <div className="px-6 pt-[18px]">
        <div className="text-sm font-medium leading-normal text-text-primary">{title}</div>
      </div>
      {actions != null && (
        <div className="absolute inset-y-0 right-6 flex items-center gap-1">{actions}</div>
      )}
      <div className="mt-4 border-b border-border-light" />
    </div>
  );
}
