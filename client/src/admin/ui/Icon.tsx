import {
  Box,
  Eye,
  Cpu,
  Bot,
  Code,
  Copy,
  File,
  Home,
  Info,
  Lock,
  Menu,
  Moon,
  Plus,
  Undo,
  User,
  Bell,
  Check,
  Clock,
  Globe,
  Image,
  Users,
  Trash2,
  Search,
  Upload,
  Filter,
  Pencil,
  Shield,
  Monitor,
  History,
  Sparkle,
  Download,
  Database,
  Settings,
  FileText,
  Briefcase,
  Lightbulb,
  ArrowLeft,
  ArrowDown,
  ArrowRight,
  RefreshCw,
  ArrowUp,
  Building2,
  ChevronUp,
  CircleHelp,
  CircleSlash,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  EyeOff,
  FolderClosed,
  Share2,
  KeyRound,
  LayoutGrid,
  ListFilter,
  Loader2,
  LogOut,
  MessageSquare,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronsUpDown,
  ChevronsDownUp,
  TriangleAlert,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '~/utils';

/** The click-ui icon names the panel uses, drawn with SassyChat's icon set (lucide). */
const ICONS = {
  'arrow-down': ArrowDown,
  'arrow-left': ArrowLeft,
  'arrow-right': ArrowRight,
  'arrow-up': ArrowUp,
  bell: Bell,
  briefcase: Briefcase,
  building: Building2,
  chat: MessageSquare,
  check: Check,
  'chevron-down': ChevronDown,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'chevron-up': ChevronUp,
  clock: Clock,
  code: Code,
  'collapse-all': ChevronsDownUp,
  copy: Copy,
  cpu: Cpu,
  cross: X,
  db: Database,
  display: Monitor,
  document: FileText,
  'dots-horizontal': MoreHorizontal,
  download: Download,
  'expand-all': ChevronsUpDown,
  external: ExternalLink,
  eye: Eye,
  'eye-closed': EyeOff,
  'folder-closed': FolderClosed,
  share: Share2,
  file: File,
  filter: Filter,
  globe: Globe,
  history: History,
  home: Home,
  image: Image,
  'info-in-circle': Info,
  information: Info,
  key: KeyRound,
  'light-bulb-on': Lightbulb,
  'list-filter': ListFilter,
  'loading-animated': Loader2,
  lock: Lock,
  'log-out': LogOut,
  menu: Menu,
  moon: Moon,
  'no-access': CircleSlash,
  pencil: Pencil,
  plus: Plus,
  question: CircleHelp,
  refresh: RefreshCw,
  robot: Bot,
  search: Search,
  settings: Settings,
  shield: Shield,
  'slide-in': PanelLeftOpen,
  'slide-out': PanelLeftClose,
  'smart-assistant': Sparkle,
  sparkle: Sparkle,
  table: LayoutGrid,
  trash: Trash2,
  undo: Undo,
  upload: Upload,
  user: User,
  users: Users,
  warning: TriangleAlert,
  x: X,
  box: Box,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';

const SIZES: Record<IconSize, string> = {
  xs: 'size-3',
  sm: 'size-4',
  md: 'size-5',
  lg: 'size-6',
  xl: 'size-8',
  xxl: 'size-12',
};

export interface IconProps {
  name: IconName;
  size?: IconSize;
  className?: string;
  role?: string;
  focusable?: boolean | 'true' | 'false';
  'aria-label'?: string;
  'aria-hidden'?: boolean | 'true' | 'false';
}

export function Icon({ name, size = 'md', className, focusable, ...aria }: IconProps) {
  const Glyph: LucideIcon = ICONS[name] ?? CircleHelp;
  return (
    <Glyph
      className={cn(
        'shrink-0',
        SIZES[size],
        name === 'loading-animated' && 'animate-spin motion-reduce:animate-none',
        className,
      )}
      focusable={focusable === undefined ? undefined : String(focusable) === 'true'}
      {...aria}
    />
  );
}
