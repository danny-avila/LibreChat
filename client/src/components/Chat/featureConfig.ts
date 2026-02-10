import {
  Bot,
  Presentation,
  Sheet,
  FileText,
  Code2,
  MessageSquare,
  Image,
  Video,
  Mail,
  Music,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface StylePreset {
  label: string;
  value: string;
}

export interface QuickOption {
  label: string;
  prompt: string;
}

export interface FeatureConfig {
  icon: LucideIcon;
  label: string;
  color: string;
  heading: string;
  placeholder: string;
  stylePresets: StylePreset[];
  quickOptions?: QuickOption[];
}

export const FEATURES: Record<string, FeatureConfig> = {
  agent: {
    icon: Bot,
    label: 'Agent',
    color: 'agent',
    heading: '$Ground Zero Agent',
    placeholder: 'Describe the task you want to automate...',
    stylePresets: [
      { label: 'GPT', value: 'gpt' },
      { label: 'Claude', value: 'claude' },
      { label: 'Gemini', value: 'gemini' },
      { label: 'Auto', value: 'auto' },
    ],
  },
  slides: {
    icon: Presentation,
    label: 'Slides',
    color: 'slides',
    heading: '$Ground Zero Slides',
    placeholder: 'Enter your presentation topic and requirements...',
    stylePresets: [
      { label: 'GPT Image 1.5', value: 'gpt-image-1.5' },
      { label: 'GPT Image 1', value: 'gpt-image-1' },
      { label: 'Nano Banana Pro', value: 'nano-banana-pro' },
      { label: 'Nano Banana', value: 'nano-banana' },
      { label: 'DALL·E 3', value: 'dall-e-3' },
      { label: 'Auto', value: 'auto' },
    ],
  },
  sheets: {
    icon: Sheet,
    label: 'Sheets',
    color: 'sheets',
    heading: '$Ground Zero Sheets',
    placeholder: 'Describe the spreadsheet you need...',
    stylePresets: [
      { label: 'GPT', value: 'gpt' },
      { label: 'Claude', value: 'claude' },
      { label: 'Gemini', value: 'gemini' },
      { label: 'Auto', value: 'auto' },
    ],
  },
  docs: {
    icon: FileText,
    label: 'Docs',
    color: 'docs',
    heading: '$Ground Zero Docs',
    placeholder: 'What document would you like to create...',
    stylePresets: [
      { label: 'GPT', value: 'gpt' },
      { label: 'Claude', value: 'claude' },
      { label: 'Gemini', value: 'gemini' },
      { label: 'Auto', value: 'auto' },
    ],
  },
  dev: {
    icon: Code2,
    label: 'Dev',
    color: 'dev',
    heading: '$Ground Zero Dev',
    placeholder: 'Describe what you want to build...',
    stylePresets: [
      { label: 'GPT', value: 'gpt' },
      { label: 'Claude', value: 'claude' },
      { label: 'Gemini', value: 'gemini' },
      { label: 'Auto', value: 'auto' },
    ],
  },
  chat: {
    icon: MessageSquare,
    label: 'Chat',
    color: 'chat',
    heading: '$Ground Zero AI',
    placeholder: 'Ask me anything...',
    stylePresets: [
      { label: 'GPT', value: 'gpt' },
      { label: 'Claude', value: 'claude' },
      { label: 'Gemini', value: 'gemini' },
      { label: 'Auto', value: 'auto' },
    ],
  },
  image: {
    icon: Image,
    label: 'Image',
    color: 'image',
    heading: '$Ground Zero Image',
    placeholder: 'Describe the image you want to generate...',
    stylePresets: [
      { label: 'GPT Image 1.5', value: 'gpt-image-1.5' },
      { label: 'GPT Image 1', value: 'gpt-image-1' },
      { label: 'Nano Banana Pro', value: 'nano-banana-pro' },
      { label: 'Nano Banana', value: 'nano-banana' },
      { label: 'DALL·E 3', value: 'dall-e-3' },
      { label: 'Auto', value: 'auto' },
    ],
  },
  video: {
    icon: Video,
    label: 'Video',
    color: 'video',
    heading: '$Ground Zero Video',
    placeholder: 'Describe the video you want to create...',
    stylePresets: [
      { label: 'Sora 2 Pro', value: 'sora-2-pro' },
      { label: 'Sora 2', value: 'sora-2' },
      { label: 'Veo', value: 'veo' },
      { label: 'Auto', value: 'auto' },
    ],
  },
  music: {
    icon: Music,
    label: 'Music',
    color: 'music',
    heading: '$Ground Zero Music',
    placeholder: 'Describe the music or song you want to create...',
    stylePresets: [],
    quickOptions: [
      { label: 'Pop', prompt: 'Create a pop song' },
      { label: 'Hip Hop', prompt: 'Create a hip hop track' },
      { label: 'Rock', prompt: 'Create a rock song' },
      { label: 'Jazz', prompt: 'Create a jazz piece' },
      { label: 'Lo-Fi', prompt: 'Create a lo-fi chill beat' },
      { label: 'Classical', prompt: 'Create a classical composition' },
      { label: 'R&B', prompt: 'Create an R&B song' },
      { label: 'Electronic', prompt: 'Create an electronic dance track' },
      { label: 'Country', prompt: 'Create a country song' },
      { label: 'Ambient', prompt: 'Create ambient background music' },
      { label: 'Upbeat', prompt: 'Create an upbeat energetic track' },
      { label: 'Sad', prompt: 'Create a melancholic emotional song' },
    ],
  },
  mail: {
    icon: Mail,
    label: 'Mail',
    color: 'mail',
    heading: '$Ground Zero Mail',
    placeholder: 'Connect your email to summarise, search, or send messages...',
    stylePresets: [
      { label: 'Gmail', value: 'gmail' },
      { label: 'Outlook', value: 'outlook' },
    ],
  },
};
