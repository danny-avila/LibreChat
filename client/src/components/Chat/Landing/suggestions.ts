import { Palette, BarChart3, PenLine, ClipboardList } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { TranslationKeys } from '~/hooks';

export interface LandingSuggestion {
  id: string;
  icon: LucideIcon;
  titleKey: TranslationKeys;
  promptKey: TranslationKeys;
}

/** V1 UX POP/BETC — 4 cas d'usage agence pour orienter les nouveaux
 *  utilisateurs depuis la landing. Affichés en mode LLM direct
 *  uniquement (cf. gate isLlmDirect dans Landing.tsx). */
export const SUGGESTIONS: ReadonlyArray<LandingSuggestion> = [
  {
    id: 'brainstorm',
    icon: Palette,
    titleKey: 'com_ui_landing_card_brainstorm_title',
    promptKey: 'com_ui_landing_card_brainstorm_prompt',
  },
  {
    id: 'insight',
    icon: BarChart3,
    titleKey: 'com_ui_landing_card_insight_title',
    promptKey: 'com_ui_landing_card_insight_prompt',
  },
  {
    id: 'tagline',
    icon: PenLine,
    titleKey: 'com_ui_landing_card_tagline_title',
    promptKey: 'com_ui_landing_card_tagline_prompt',
  },
  {
    id: 'brief',
    icon: ClipboardList,
    titleKey: 'com_ui_landing_card_brief_title',
    promptKey: 'com_ui_landing_card_brief_prompt',
  },
];
