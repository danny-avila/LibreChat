import React from 'react';
import {
  OpenAIEditorIcon,
  AnthropicEditorIcon,
  GoogleEditorIcon,
  FrenchAlpacaEditorIcon,
} from '~/components/svg/editors/EditorIcons';
import type { LocalizeFunction } from '~/common';
import type { TranslationKeys } from '~/hooks';

type LevelKey = Extract<
  TranslationKeys,
  `com_model_level_${'powerful' | 'balanced' | 'fast' | 'legacy' | 'fr'}`
>;

type EditorKey = 'openai' | 'anthropic' | 'google' | 'frenchAlpaca';

interface EditorInfo {
  name: string;
  Icon: React.FC<{ size?: number; className?: string }>;
  prettify: (model: string) => string;
}

const prettifyGpt = (m: string): string => {
  if (!/^gpt-/i.test(m)) {
    return m;
  }
  return 'GPT' + m.slice(3);
};

const prettifyClaude = (m: string): string => {
  const noDate = m.replace(/-\d{8}$/, '');
  const parts = noDate.split('-');
  if (parts.length < 3 || parts[0].toLowerCase() !== 'claude') {
    return m;
  }
  const families = ['opus', 'sonnet', 'haiku'];
  const familyIdx = parts.findIndex((p) => families.includes(p.toLowerCase()));
  if (familyIdx === -1) {
    return m;
  }
  const family = parts[familyIdx].charAt(0).toUpperCase() + parts[familyIdx].slice(1);
  const numbers = parts
    .filter((p, i) => i !== 0 && i !== familyIdx && /^\d+$/.test(p))
    .join('.');
  return numbers ? `Claude ${family} ${numbers}` : `Claude ${family}`;
};

const prettifyGemini = (m: string): string => {
  if (!/^gemini-/i.test(m)) {
    return m;
  }
  const parts = m.slice(7).split('-');
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const lower = p.toLowerCase();
    if (i === 0 && /^\d/.test(p)) {
      out.push(p);
      continue;
    }
    if (/^\d+$/.test(p)) {
      continue;
    }
    if (lower === 'preview' || lower === 'exp') {
      out.push(lower);
      continue;
    }
    out.push(p.charAt(0).toUpperCase() + p.slice(1));
  }
  return `Gemini ${out.join(' ')}`;
};

const prettifyFrenchAlpaca = (m: string): string => {
  const match = m.match(/French-Alpaca-Llama(\d+)-(\d+B)/i);
  return match ? `French-Alpaca Llama ${match[1]} ${match[2]}` : m;
};

const EDITORS: Record<EditorKey, EditorInfo> = {
  openai:       { name: 'OpenAI',        Icon: OpenAIEditorIcon,       prettify: prettifyGpt },
  anthropic:    { name: 'Anthropic',     Icon: AnthropicEditorIcon,    prettify: prettifyClaude },
  google:       { name: 'Google',        Icon: GoogleEditorIcon,       prettify: prettifyGemini },
  frenchAlpaca: { name: 'French-Alpaca', Icon: FrenchAlpacaEditorIcon, prettify: prettifyFrenchAlpaca },
};

interface ModelMapping {
  match: (model: string) => boolean;
  level: LevelKey;
  editor: EditorKey;
}

const MODEL_MAPPINGS: ModelMapping[] = [
  { match: (m) => m === 'gpt-5.2',    level: 'com_model_level_powerful', editor: 'openai' },
  { match: (m) => m === 'gpt-5.1',    level: 'com_model_level_balanced', editor: 'openai' },
  { match: (m) => m === 'gpt-5-mini', level: 'com_model_level_fast',     editor: 'openai' },
  { match: (m) => m === 'gpt-4o',     level: 'com_model_level_legacy',   editor: 'openai' },

  { match: (m) => /^claude-opus/i.test(m),   level: 'com_model_level_powerful', editor: 'anthropic' },
  { match: (m) => /^claude-sonnet/i.test(m), level: 'com_model_level_balanced', editor: 'anthropic' },
  { match: (m) => /^claude-haiku/i.test(m),  level: 'com_model_level_fast',     editor: 'anthropic' },

  { match: (m) => /^gemini-3\.1-pro/i.test(m),      level: 'com_model_level_powerful', editor: 'google' },
  { match: (m) => /^gemini-2\.0/i.test(m),          level: 'com_model_level_fast',     editor: 'google' },
  { match: (m) => /^gemini-.*-flash-lite/i.test(m), level: 'com_model_level_fast',     editor: 'google' },
  { match: (m) => /^gemini-.*-flash/i.test(m),      level: 'com_model_level_balanced', editor: 'google' },
  { match: (m) => /^gemini-.*-pro/i.test(m),        level: 'com_model_level_powerful', editor: 'google' },

  { match: (m) => m.startsWith('jpacifico/French-Alpaca'), level: 'com_model_level_fr', editor: 'frenchAlpaca' },
];

export interface ModelDisplayInfo {
  editorName: string;
  editorIcon: React.ReactNode | null;
  dropdownLabel: string;
  prettyName: string;
}

interface GetModelDisplayOptions {
  iconSize?: number;
}

export const getModelDisplayName = (
  modelTechName: string | undefined | null,
  localize: LocalizeFunction,
  options: GetModelDisplayOptions = {},
): ModelDisplayInfo => {
  const { iconSize = 20 } = options;
  const trimmed = modelTechName?.trim() ?? '';
  if (!trimmed) {
    return { editorName: '', editorIcon: null, dropdownLabel: '', prettyName: '' };
  }
  for (const mapping of MODEL_MAPPINGS) {
    if (mapping.match(trimmed)) {
      const editor = EDITORS[mapping.editor];
      const Icon = editor.Icon;
      const prettyName = editor.prettify(trimmed);
      const levelLabel = localize(mapping.level);
      return {
        editorName: editor.name,
        editorIcon: <Icon size={iconSize} />,
        dropdownLabel: `${prettyName} (${levelLabel})`,
        prettyName,
      };
    }
  }
  return {
    editorName: trimmed,
    editorIcon: null,
    dropdownLabel: trimmed,
    prettyName: trimmed,
  };
};
