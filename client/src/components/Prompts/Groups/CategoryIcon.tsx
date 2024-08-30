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
} from 'lucide-react';
import { cn } from '~/utils';

const categoryIconMap: Record<string, React.ElementType> = {
  misc: BoxIcon,
  operations: Dices,
  marketing: PenLineIcon,
  techops: LightbulbIcon,
  commercial: ShoppingBagIcon,
  finance: LineChartIcon,
  code: TerminalSquareIcon,
  product: PlaneTakeoffIcon,
  people_ops: GraduationCapIcon,
};



const categoryColorMap: Record<string, string> = {
  operations: 'text-red-500',
  misc: 'text-blue-300',
  marketing: 'text-purple-400',
  techops: 'text-yellow-300',
  commercial: 'text-purple-400',
  finance: 'text-yellow-300',
  code: 'text-orange-400',
  product: 'text-orange-400',
  people_ops: 'text-blue-300',
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
  return <IconComponent className={cn(colorClass, className)} />;
}
