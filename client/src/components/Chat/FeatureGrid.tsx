import {
  Bot,
  Presentation,
  Sheet,
  FileText,
  Code2,
  MessageSquare,
  Image,
  Video,
} from 'lucide-react';

const features = [
  { icon: Bot, label: 'Agent' },
  { icon: Presentation, label: 'Slides' },
  { icon: Sheet, label: 'Sheets' },
  { icon: FileText, label: 'Docs' },
  { icon: Code2, label: 'Dev' },
  { icon: MessageSquare, label: 'Chat' },
  { icon: Image, label: 'Image' },
  { icon: Video, label: 'Video' },
] as const;

export default function FeatureGrid() {
  return (
    <div className="mt-4 flex flex-wrap justify-center gap-4">
      {features.map(({ icon: Icon, label }) => (
        <button
          key={label}
          className="flex flex-col items-center gap-1 transition-opacity hover:opacity-80"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-[--feature-tile-bg]">
            <Icon size={18} className="text-text-secondary" />
          </div>
          <span className="text-[8px] text-[--feature-label]">{label}</span>
        </button>
      ))}
    </div>
  );
}
