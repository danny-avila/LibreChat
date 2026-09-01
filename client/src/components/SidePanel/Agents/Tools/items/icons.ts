import {
  Code,
  MessageCircleQuestion,
  Globe,
  Brain,
  Sparkles,
  FileText,
  FileSearch,
  Wrench,
  Server,
  Workflow,
  Zap,
  Layers,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AgentItem } from './types';

export interface ItemIcon {
  Icon: LucideIcon;
  colorClass: string;
  iconUrl?: string;
}

const BUILTIN_ICONS: Record<string, ItemIcon> = {
  execute_code: {
    Icon: Code,
    colorClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300',
  },
  web_search: {
    Icon: Globe,
    colorClass: 'bg-blue-500/15 text-blue-600 dark:text-blue-300',
  },
  artifacts: {
    Icon: Sparkles,
    colorClass: 'bg-purple-500/15 text-purple-600 dark:text-purple-300',
  },
  context: {
    Icon: FileText,
    colorClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-300',
  },
  file_search: {
    Icon: FileSearch,
    colorClass: 'bg-pink-500/15 text-pink-600 dark:text-pink-300',
  },
  memory: {
    Icon: Brain,
    colorClass: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300',
  },
  ask_user_question: {
    Icon: MessageCircleQuestion,
    colorClass: 'bg-teal-500/15 text-teal-600 dark:text-teal-300',
  },
};

const KIND_FALLBACK_ICONS: Record<AgentItem['kind'], ItemIcon> = {
  builtin: {
    Icon: Layers,
    colorClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300',
  },
  tool: {
    Icon: Wrench,
    colorClass: 'bg-sky-500/15 text-sky-600 dark:text-sky-300',
  },
  mcp: {
    Icon: Server,
    colorClass: 'bg-violet-500/15 text-violet-600 dark:text-violet-300',
  },
  skill: {
    Icon: Zap,
    colorClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-300',
  },
  action: {
    Icon: Workflow,
    colorClass: 'bg-rose-500/15 text-rose-600 dark:text-rose-300',
  },
};

function extractIconUrl(item: AgentItem): string | undefined {
  if (item.kind === 'tool') {
    const url = item.plugin?.icon;
    return typeof url === 'string' && url.length > 0 ? url : undefined;
  }
  if (item.kind === 'mcp') {
    const url = item.server?.metadata?.icon;
    return typeof url === 'string' && url.length > 0 ? url : undefined;
  }
  return undefined;
}

export function getIconForItem(item: AgentItem): ItemIcon {
  if (item.kind === 'builtin') {
    return BUILTIN_ICONS[item.iconKey] ?? KIND_FALLBACK_ICONS.builtin;
  }
  const base = KIND_FALLBACK_ICONS[item.kind];
  const iconUrl = extractIconUrl(item);
  return iconUrl ? { ...base, iconUrl } : base;
}
