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
  roleplay: Dices,
  write: PenLineIcon,
  idea: LightbulbIcon,
  shop: ShoppingBagIcon,
  finance: LineChartIcon,
  code: TerminalSquareIcon,
  travel: PlaneTakeoffIcon,
  teach_or_explain: GraduationCapIcon,
  branding: BadgePercentIcon,
  copywriting: FileTextIcon,
  email_marketing: MailIcon,
  social_media: Share2Icon,
  content_strategy: LayoutIcon,
  seo: SearchIcon,
  ads: MegaphoneIcon,
  customer_research: UsersIcon,
  product_marketing: PackageIcon,
  marketing_analytics: BarChartIcon,
};

const categoryColorMap: Record<string, string> = {
  code: 'text-red-500',
  misc: 'text-blue-300',
  shop: 'text-purple-400',
  idea: 'text-yellow-300',
  write: 'text-purple-400',
  travel: 'text-yellow-300',
  finance: 'text-orange-400',
  roleplay: 'text-orange-400',
  teach_or_explain: 'text-blue-300',
  branding: 'text-yellow-500',
  copywriting: 'text-purple-500',
  email_marketing: 'text-pink-400',
  social_media: 'text-blue-400',
  content_strategy: 'text-green-400',
  seo: 'text-indigo-400',
  ads: 'text-red-400',
  customer_research: 'text-teal-400',
  product_marketing: 'text-orange-300',
  marketing_analytics: 'text-green-500',
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
