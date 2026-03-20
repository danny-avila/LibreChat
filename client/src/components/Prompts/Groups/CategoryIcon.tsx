import React from 'react';
import {
  Dices,
  BoxIcon,
  PenLineIcon,
  LightbulbIcon,
  LineChartIcon,
  ShoppingBagIcon,
  PlaneTakeoffIcon,
  GraduationCapIcon,
  TerminalSquareIcon,
  // NEW: Add these for agent categories
  Users as UsersIcon,
  Beaker as BeakerIcon,
  Settings as SettingsIcon,
} from 'lucide-react';
import { cn } from '~/utils';

const categoryIconMap: Record<string, React.ElementType> = {
  misc: BoxIcon,
  roleplay: Dices,
  write: PenLineIcon,
  idea: LightbulbIcon,
  shop: ShoppingBagIcon,
  finance: LineChartIcon,
  code: TerminalSquareIcon,
  travel: PlaneTakeoffIcon,
  teach_or_explain: GraduationCapIcon,
  // NEW: Agent categories
  general: BoxIcon,
  hr: UsersIcon,
  rd: BeakerIcon,
  it: TerminalSquareIcon,
  sales: LineChartIcon,
  aftersales: SettingsIcon,
};

const categoryColorMap: Record<string, string> = {
  code: 'text-red-500',
  misc: 'text-blue-300',
  shop: 'text-purple-400',
  idea: 'text-yellow-500/90 dark:text-yellow-300 ',
  write: 'text-purple-400',
  travel: 'text-yellow-500/90 dark:text-yellow-300 ',
  finance: 'text-orange-400',
  roleplay: 'text-orange-400',
  teach_or_explain: 'text-blue-300',
  // NEW: Agent categories
  general: 'text-blue-500',
  hr: 'text-green-500',
  rd: 'text-purple-500',
  it: 'text-red-500',
  sales: 'text-orange-500',
  aftersales: 'text-yellow-500',
};

export default function CategoryIcon({
  category,
  className = '',
}: {
  category: string;
  className?: string;
}) {
  const IconComponent = categoryIconMap[category];
  const colorClass = categoryColorMap[category] + ' ' + className;
  if (!IconComponent) {
    return null;
  }
  return <IconComponent className={cn(colorClass, className)} aria-hidden="true" />;
}
