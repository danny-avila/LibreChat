import { useState } from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
} from '../ui';
import Fuse, { FuseResult } from 'fuse.js';
import { ChevronLeft } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

export type Presets = {
  title: string;
  description: string;
  image: string;
  prompt: string;
  temperature?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
};

function MarketplaceView() {
  const navigate = useNavigate();
  const location = useLocation();

  const presets: Presets[] = [
    {
      title: 'Gen Z Engagement Specialist',
      description:
        'Specializes in engaging Gen Z users with tailored interactions reflecting their preferences and values.',
      image:
        'https://chat-preview.lobehub.com/_next/image?url=https%3A%2F%2Fregistry.npmmirror.com%2F%40lobehub%2Fassets-emoji-anim%2Flatest%2Ffiles%2Fassets%2Fzzz.webp&w=96&q=75',
      prompt:
        'As a Gen Z bot, your role is to engage with users in a manner that resonates with the characteristics and preferences of the Gen Z demographic. Your interactions should be tailored to appeal to Gen Z individuals, incorporating their communication style, interests, and digital habits.',
    },
    {
      title: 'Schedule Management Assistant',
      description:
        'Schedule Management Assistant, calls the time plugin to handle requests for adding, querying, and deleting schedules, supports multiple operations and reminders',
      image:
        'https://chat-preview.lobehub.com/_next/image?url=https%3A%2F%2Fregistry.npmmirror.com%2F%40lobehub%2Fassets-emoji-anim%2Flatest%2Ffiles%2Fassets%2Fcalendar.webp&w=96&q=75',
      prompt:
        'You are a schedule management assistant. Every time a user initiates a schedule management request, first call the time assistant plugin to return the time as the current system time, and then proceed with schedule management; When the user uses /add, /list, /del, they correspond to the add, list, and delete actions. If the user does not specify an action, you need to determine which of the three actions the user\'s action belongs to. Please communicate with the user in Chinese throughout.',
    },
    {
      title: 'Business Email Writing Expert',
      description:
        'Business email writing expert specializing in bilingual business emails in Chinese and English, cross-cultural communication, and engagement in the GitHub open-source community',
      image:
        'https://chat-preview.lobehub.com/_next/image?url=https%3A%2F%2Fregistry.npmmirror.com%2F%40lobehub%2Fassets-emoji-anim%2Flatest%2Ffiles%2Fassets%2Fbriefcase.webp&w=96&q=75',
      prompt:
        'Business email writing expert specializing in bilingual business emails in Chinese and English, covering areas such as business cooperation and business authorization. Possesses extensive experience in business communication, ensuring precise grasp of email tone and format to ensure clear and professional information delivery. As an independent developer, has in-depth understanding of GitHub and open-source software community habits, enabling effective cross-cultural and cross-lingual business communication.',
    },
    {
      title: 'Gen Z Engagement Specialist',
      description:
        'Specializes in engaging Gen Z users with tailored interactions reflecting their preferences and values.',
      image:
        'https://chat-preview.lobehub.com/_next/image?url=https%3A%2F%2Fregistry.npmmirror.com%2F%40lobehub%2Fassets-emoji-anim%2Flatest%2Ffiles%2Fassets%2Fzzz.webp&w=96&q=75',
      prompt:
        'As a Gen Z bot, your role is to engage with users in a manner that resonates with the characteristics and preferences of the Gen Z demographic. Your interactions should be tailored to appeal to Gen Z individuals, incorporating their communication style, interests, and digital habits.',
    },
    {
      title: 'Schedule Management Assistant',
      description:
        'Schedule Management Assistant, calls the time plugin to handle requests for adding, querying, and deleting schedules, supports multiple operations and reminders',
      image:
        'https://chat-preview.lobehub.com/_next/image?url=https%3A%2F%2Fregistry.npmmirror.com%2F%40lobehub%2Fassets-emoji-anim%2Flatest%2Ffiles%2Fassets%2Fcalendar.webp&w=96&q=75',
      prompt:
        'You are a schedule management assistant. Every time a user initiates a schedule management request, first call the time assistant plugin to return the time as the current system time, and then proceed with schedule management; When the user uses /add, /list, /del, they correspond to the add, list, and delete actions. If the user does not specify an action, you need to determine which of the three actions the user\'s action belongs to. Please communicate with the user in Chinese throughout.',
    },
    {
      title: 'Business Email Writing Expert',
      description:
        'Business email writing expert specializing in bilingual business emails in Chinese and English, cross-cultural communication, and engagement in the GitHub open-source community',
      image:
        'https://chat-preview.lobehub.com/_next/image?url=https%3A%2F%2Fregistry.npmmirror.com%2F%40lobehub%2Fassets-emoji-anim%2Flatest%2Ffiles%2Fassets%2Fbriefcase.webp&w=96&q=75',
      prompt:
        'Business email writing expert specializing in bilingual business emails in Chinese and English, covering areas such as business cooperation and business authorization. Possesses extensive experience in business communication, ensuring precise grasp of email tone and format to ensure clear and professional information delivery. As an independent developer, has in-depth understanding of GitHub and open-source software community habits, enabling effective cross-cultural and cross-lingual business communication.',
    },
    {
      title: 'Gen Z Engagement Specialist',
      description:
        'Specializes in engaging Gen Z users with tailored interactions reflecting their preferences and values.',
      image:
        'https://chat-preview.lobehub.com/_next/image?url=https%3A%2F%2Fregistry.npmmirror.com%2F%40lobehub%2Fassets-emoji-anim%2Flatest%2Ffiles%2Fassets%2Fzzz.webp&w=96&q=75',
      prompt:
        'As a Gen Z bot, your role is to engage with users in a manner that resonates with the characteristics and preferences of the Gen Z demographic. Your interactions should be tailored to appeal to Gen Z individuals, incorporating their communication style, interests, and digital habits.',
    },
    {
      title: 'Schedule Management Assistant',
      description:
        'Schedule Management Assistant, calls the time plugin to handle requests for adding, querying, and deleting schedules, supports multiple operations and reminders',
      image:
        'https://chat-preview.lobehub.com/_next/image?url=https%3A%2F%2Fregistry.npmmirror.com%2F%40lobehub%2Fassets-emoji-anim%2Flatest%2Ffiles%2Fassets%2Fcalendar.webp&w=96&q=75',
      prompt:
        'You are a schedule management assistant. Every time a user initiates a schedule management request, first call the time assistant plugin to return the time as the current system time, and then proceed with schedule management; When the user uses /add, /list, /del, they correspond to the add, list, and delete actions. If the user does not specify an action, you need to determine which of the three actions the user\'s action belongs to. Please communicate with the user in Chinese throughout.',
    },
    {
      title: 'Business Email Writing Expert',
      description:
        'Business email writing expert specializing in bilingual business emails in Chinese and English, cross-cultural communication, and engagement in the GitHub open-source community',
      image:
        'https://chat-preview.lobehub.com/_next/image?url=https%3A%2F%2Fregistry.npmmirror.com%2F%40lobehub%2Fassets-emoji-anim%2Flatest%2Ffiles%2Fassets%2Fbriefcase.webp&w=96&q=75',
      prompt:
        'Business email writing expert specializing in bilingual business emails in Chinese and English, covering areas such as business cooperation and business authorization. Possesses extensive experience in business communication, ensuring precise grasp of email tone and format to ensure clear and professional information delivery. As an independent developer, has in-depth understanding of GitHub and open-source software community habits, enabling effective cross-cultural and cross-lingual business communication.',
    },
    {
      title: 'Gen Z Engagement Specialist',
      description:
        'Specializes in engaging Gen Z users with tailored interactions reflecting their preferences and values.',
      image:
        'https://chat-preview.lobehub.com/_next/image?url=https%3A%2F%2Fregistry.npmmirror.com%2F%40lobehub%2Fassets-emoji-anim%2Flatest%2Ffiles%2Fassets%2Fzzz.webp&w=96&q=75',
      prompt:
        'As a Gen Z bot, your role is to engage with users in a manner that resonates with the characteristics and preferences of the Gen Z demographic. Your interactions should be tailored to appeal to Gen Z individuals, incorporating their communication style, interests, and digital habits.',
    },
    {
      title: 'Schedule Management Assistant',
      description:
        'Schedule Management Assistant, calls the time plugin to handle requests for adding, querying, and deleting schedules, supports multiple operations and reminders',
      image:
        'https://chat-preview.lobehub.com/_next/image?url=https%3A%2F%2Fregistry.npmmirror.com%2F%40lobehub%2Fassets-emoji-anim%2Flatest%2Ffiles%2Fassets%2Fcalendar.webp&w=96&q=75',
      prompt:
        'You are a schedule management assistant. Every time a user initiates a schedule management request, first call the time assistant plugin to return the time as the current system time, and then proceed with schedule management; When the user uses /add, /list, /del, they correspond to the add, list, and delete actions. If the user does not specify an action, you need to determine which of the three actions the user\'s action belongs to. Please communicate with the user in Chinese throughout.',
    },
    {
      title: 'Business Email Writing Expert',
      description:
        'Business email writing expert specializing in bilingual business emails in Chinese and English, cross-cultural communication, and engagement in the GitHub open-source community',
      image:
        'https://chat-preview.lobehub.com/_next/image?url=https%3A%2F%2Fregistry.npmmirror.com%2F%40lobehub%2Fassets-emoji-anim%2Flatest%2Ffiles%2Fassets%2Fbriefcase.webp&w=96&q=75',
      prompt:
        'Business email writing expert specializing in bilingual business emails in Chinese and English, covering areas such as business cooperation and business authorization. Possesses extensive experience in business communication, ensuring precise grasp of email tone and format to ensure clear and professional information delivery. As an independent developer, has in-depth understanding of GitHub and open-source software community habits, enabling effective cross-cultural and cross-lingual business communication.',
    },
  ];

  const searchResultAll = presets.map((val, index) => ({
    item: Object.assign(val, {}),
    refIndex: index,
    matches: [],
    score: 1,
  }));

  const [searchTerm, setSarchTerm] = useState('');
  const [searchResult, setSearchResult] = useState<FuseResult<Presets>[]>(searchResultAll);
  const [lastChangeTime, setLastChangeTime] = useState(Date.now());

  const fuse = new Fuse(presets, {
    keys: ['title', 'description'],
    includeScore: true,
  });

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSarchTerm(e.target.value);
    if (!e.target.value) {
      return setSearchResult(searchResultAll);
    }
    const result = fuse.search(e.target.value);
    setSearchResult(result);
    setLastChangeTime(Date.now());
  };

  const searchParmas = new Map();

  location.search
    .slice(1)
    .split('&')
    .map((i) => searchParmas.set(i.split('=')[0], i.split('=')[1]));

  const handlePresetSelect = (item: Presets) => {
    localStorage.setItem('selected-preset', JSON.stringify(item));
    const redirectPath = decodeURIComponent(searchParmas.get('redirectPath'));
    if (redirectPath) {
      return navigate(redirectPath, { replace: true });
    }
    navigate('/c/new', { replace: true });
  };

  return (
    <div className="overflow-scroll">
      <Button
        onClick={() => {
          const redirectPath = decodeURIComponent(searchParmas.get('redirectPath'));
          if (redirectPath) {
            return navigate(redirectPath, { replace: true });
          }
          navigate('/c/new', { replace: true });
        }}
        className="mt-2"
        variant="link"
      >
        <ChevronLeft /> Go Back to Chat
      </Button>
      <div className="sticky top-0 grid h-auto w-full place-content-center bg-white/70 p-3 backdrop-blur-md dark:bg-gray-800/70 dark:text-white">
        <h1 className="font-mono text-2xl font-bold ">Promt Marketplace</h1>
      </div>
      <div className="mx-auto w-full max-w-xl p-4 md:max-w-2xl lg:max-w-6xl">
        <Input
          value={searchTerm}
          onChange={handleSearch}
          placeholder="Search prompts"
          className="border-0 border-gray-500 bg-gray-100 focus:border dark:bg-gray-600"
        />
        <div className="mt-6 grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
          {searchResult.map((result) => (
            <Dialog key={result.refIndex}>
              <DialogTrigger>
                <div className="space-y-3 rounded border bg-gradient-to-b from-white from-10% via-gray-50 via-30% to-gray-100 to-90% p-3 text-left shadow hover:border-gray-500 dark:border-gray-600 dark:from-gray-800 dark:via-gray-700 dark:to-gray-600 hover:dark:border-gray-300">
                  <div className="h-16 w-16 rounded-full bg-gray-100 p-2 dark:bg-gray-750">
                    <img src={result.item.image} alt={result.item.title} />
                  </div>
                  <h3 className="line-clamp-1 font-semibold dark:text-gray-50">
                    {result.item.title}
                  </h3>
                  <p className="line-clamp-3 text-sm text-gray-600 dark:text-gray-300">
                    {result.item.description}
                  </p>
                </div>
              </DialogTrigger>
              <DialogContent className="dark:bg-gray-800">
                <DialogHeader>
                  <DialogTitle>Add Preset to Your Collection</DialogTitle>
                </DialogHeader>
                <div className="mt-[-1rem] max-h-[50vh] overflow-x-scroll p-4 text-center">
                  <div className="grid place-items-center">
                    <div className="h-16 w-16 rounded-full bg-gray-100 p-2 dark:bg-gray-750">
                      <img src={result.item.image} alt={result.item.title} />
                    </div>
                  </div>
                  <h3 className=" ont-semibold dark:text-gray-50">{result.item.title}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {result.item.description}
                  </p>
                  <div className="mt-4 space-y-2 p-2">
                    <p className="text-left text-lg font-semibold dark:text-white">Prompt:</p>
                    <p className="text-left dark:text-white">{result.item.prompt}</p>
                  </div>
                  <div className="h-[1px] bg-gray-300 dark:bg-gray-600/80" />
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => handlePresetSelect(result.item)}
                    className="hover:dark:bg-gray-500"
                    type="submit"
                  >
                    Add Preset
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ))}
        </div>
      </div>
    </div>
  );
}

export default MarketplaceView;
