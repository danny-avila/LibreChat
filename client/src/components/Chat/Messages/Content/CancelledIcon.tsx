import { X } from 'lucide-react';

export default function CancelledIcon() {
  return (
    <div className="flex h-full w-full items-center justify-center rounded-full bg-transparent text-text-secondary">
      <X className="size-4" aria-hidden="true" />
    </div>
  );
}
