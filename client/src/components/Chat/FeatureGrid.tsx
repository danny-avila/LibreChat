import {
  Bot,
  Presentation,
  Sheet,
  FileText,
  Code2,
  MessageSquare,
  Image,
  Video,
  Music,
  Mail,
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSetRecoilState } from 'recoil';
import { useMailConnectionStatus } from '~/data-provider';
import store from '~/store';

const featureOrder = [
  { key: 'agent', icon: Bot, label: 'Agent', color: 'agent' },
  { key: 'slides', icon: Presentation, label: 'Slides', color: 'slides' },
  { key: 'sheets', icon: Sheet, label: 'Sheets', color: 'sheets' },
  { key: 'docs', icon: FileText, label: 'Docs', color: 'docs' },
  { key: 'dev', icon: Code2, label: 'Dev', color: 'dev' },
  { key: 'chat', icon: MessageSquare, label: 'Chat', color: 'chat' },
  { key: 'image', icon: Image, label: 'Image', color: 'image' },
  { key: 'video', icon: Video, label: 'Video', color: 'video' },
  { key: 'music', icon: Music, label: 'Music', color: 'music' },
  { key: 'mail', icon: Mail, label: 'Mail', color: 'mail' },
] as const;

export default function FeatureGrid() {
  const navigate = useNavigate();
  const location = useLocation();
  const setActiveStylePreset = useSetRecoilState(store.activeStylePreset);
  const setMailConsentOpen = useSetRecoilState(store.mailConsentDialogOpen);
  const { data: mailStatus } = useMailConnectionStatus();

  const handleClick = (key: string) => {
    setActiveStylePreset(null);
    if (key === 'chat') {
      navigate('/c/new');
      return;
    }
    if (key === 'mail' && !(mailStatus?.gmail || mailStatus?.outlook)) {
      setMailConsentOpen(true);
      return;
    }
    // Toggle: if already on this feature page, go back to default
    if (location.pathname === `/${key}`) {
      navigate('/c/new');
    } else {
      navigate(`/${key}`);
    }
  };

  return (
    <div className="mt-4 flex flex-wrap justify-center gap-4">
      {featureOrder.map(({ key, icon: Icon, label, color }) => {
        const isActive =
          location.pathname === `/${key}` ||
          (key === 'chat' && (location.pathname === '/c/new' || location.pathname === '/'));
        return (
          <button
            key={key}
            onClick={() => handleClick(key)}
            className={`flex flex-col items-center gap-1 transition-all ${
              isActive ? 'scale-110 opacity-100' : 'opacity-50 hover:opacity-75'
            }`}
          >
            <div
              className="flex h-9 w-9 items-center justify-center rounded-[9px] transition-shadow"
              style={{
                backgroundColor: `var(--feature-${color})`,
                boxShadow: isActive
                  ? `0 0 0 2px var(--feature-${color}-icon)`
                  : 'none',
              }}
            >
              <Icon size={18} style={{ color: `var(--feature-${color}-icon)` }} />
            </div>
            <span
              className={`text-[8px] transition-colors ${
                isActive ? 'font-semibold text-text-primary' : 'text-[--feature-label]'
              }`}
            >
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
