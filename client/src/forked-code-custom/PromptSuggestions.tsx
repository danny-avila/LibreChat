import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { useRecoilState } from 'recoil';
import { cn } from '~/utils';
import store from '~/store';
import { useChatContext } from '~/Providers';
import { mainTextareaId } from '~/common';
import { Sparkles, Newspaper, Code, GraduationCap } from 'lucide-react';

interface PromptSuggestion {
  text: string;
}

interface PromptCategory {
  id: string;
  name: string;
  icon: React.ReactNode;
  prompts: PromptSuggestion[];
}

interface PromptSuggestionsProps {
  prompts?: PromptSuggestion[];
}

/**
 * Hook for managing prompt suggestions
 * Returns an array of suggested prompts to show to the user
 */
const usePromptSuggestions = () => {
  // Default hardcoded prompts
  const defaultPrompts: PromptSuggestion[] = useMemo(
    () => [
      { text: 'How does AI work?' },
      { text: 'Are black holes real?' },
      { text: 'How many Rs are in the word "strawberry"?' },
      { text: 'List of good questions to ask an AI chat bot' },
    ],
    [],
  );

  // Create prompts for different categories
  const promptCategories: PromptCategory[] = useMemo(
    () => [
      {
        id: 'create',
        name: 'Create',
        icon: <Sparkles className="max-sm:block" />,
        prompts: [
          { text: 'Write a short story about a robot discovering emotions' },
          { text: 'Help me outline a sci-fi novel set in a post-apocalyptic world' },
          { text: 'Create a character profile for a complex villain with sympathetic motives' },
          { text: 'Give me 5 creative writing prompts for flash fiction' },
        ],
      },
      {
        id: 'explore',
        name: 'Explore',
        icon: <Newspaper className="max-sm:block" />,
        prompts: [
          { text: 'Good books for fans of Rick Rubin' },
          { text: 'Countries ranked by number of corgis' },
          { text: 'Most successful companies in the world' },
          { text: 'How much does Claude cost?' },
        ],
      },
      {
        id: 'code',
        name: 'Code',
        icon: <Code className="max-sm:block" />,
        prompts: [
          { text: 'Write code to invert a binary search tree in Python' },
          { text: 'What\'s the difference between Promise.all and Promise.allSettled?' },
          { text: 'Explain React\'s useEffect cleanup function' },
          { text: 'Best practices for error handling in async/await' },
        ],
      },
      {
        id: 'learn',
        name: 'Learn',
        icon: <GraduationCap className="max-sm:block" />,
        prompts: [
          { text: 'Beginner\'s guide to TypeScript' },
          { text: 'Explain the CAP theorem in distributed systems' },
          { text: 'Why is AI so expensive?' },
          { text: 'Are black holes real?' },
        ],
      },
    ],
    [],
  );

  return {
    promptCategories,
    defaultPrompts,
  };
};

/**
 * Component for displaying prompt suggestions below the chat input
 * Styled to match the application theme using existing classes
 */
export const PromptSuggestions = ({ prompts: externalPrompts }: PromptSuggestionsProps) => {
  const { index } = useChatContext();
  const [, setActivePrompt] = useRecoilState(store.activePromptByIndex(index));
  const { promptCategories, defaultPrompts } = usePromptSuggestions();
  const initialLoadRef = useRef(true);
  const timersRef = useRef<NodeJS.Timeout[]>([]);

  // State for active category (null means no category selected)
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);

  // Animation states
  const [isVisible, setIsVisible] = useState(false);
  const [animatedItems, setAnimatedItems] = useState<number[]>([]);
  const [animatedCategories, setAnimatedCategories] = useState(false);

  // Get the current prompts based on active category
  const currentPrompts = useMemo(() => {
    if (externalPrompts && externalPrompts.length > 0) {
      return externalPrompts;
    }

    if (!activeCategoryId) {
      return defaultPrompts;
    }

    const activeCategory = promptCategories.find((cat) => cat.id === activeCategoryId);
    return activeCategory?.prompts || defaultPrompts;
  }, [activeCategoryId, promptCategories, defaultPrompts, externalPrompts]);

  // Limit to max 4 prompts
  const displayPrompts = useMemo(() => currentPrompts.slice(0, 4), [currentPrompts]);

  // Animation timing configuration
  const animationConfig = useMemo(
    () => ({
      initialDelay: 600, // Wait for SplitText to animate
      categoryDelay: 200, // Reduced from 400 to make category buttons appear faster
      promptsStartDelay: 400, // Add delay before starting prompt animations
      staggerDelay: 150, // Delay between each item
    }),
    [],
  );

  // Clean up all timers when component unmounts
  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, []);

  // Toggle category selection
  const handleCategoryClick = useCallback((categoryId: string) => {
    setActiveCategoryId((prev) => (prev === categoryId ? null : categoryId));
  }, []);

  // Initial animation sequence
  useEffect(() => {
    if (!initialLoadRef.current) {
      return;
    }

    const { initialDelay, categoryDelay } = animationConfig;

    // Start overall component visibility animation after initial delay
    const visibilityTimer = setTimeout(() => {
      setIsVisible(true);

      // Animate category buttons quickly after component visibility
      const categoriesTimer = setTimeout(() => {
        setAnimatedCategories(true);
      }, categoryDelay);

      timersRef.current.push(categoriesTimer);
    }, initialDelay);

    timersRef.current.push(visibilityTimer);
  }, [animationConfig]);

  // Staggered animation for individual prompt items - only on initial load
  useEffect(() => {
    if (!isVisible || !initialLoadRef.current) {
      return;
    }

    const { promptsStartDelay, staggerDelay } = animationConfig;

    // Delay prompt animations to start after categories are visible
    const initialPromptDelay = setTimeout(() => {
      // Animate items one by one from top to bottom
      const indices = [...displayPrompts.keys()];

      // Clear any existing animations first
      setAnimatedItems([]);

      // Add each item one by one with delay
      indices.forEach((index, i) => {
        const timer = setTimeout(() => {
          setAnimatedItems((prev) => {
            // Avoid unnecessary re-renders by checking if item is already included
            if (prev.includes(index)) {
              return prev;
            }
            return [...prev, index];
          });
        }, staggerDelay * i);

        timersRef.current.push(timer);
      });

      // Mark initial load as complete after animations
      const finalTimer = setTimeout(
        () => {
          initialLoadRef.current = false;
        },
        staggerDelay * indices.length + 100,
      );

      timersRef.current.push(finalTimer);
    }, promptsStartDelay);

    timersRef.current.push(initialPromptDelay);
  }, [isVisible, displayPrompts, animationConfig]);

  const handleSelectPrompt = useCallback(
    (text: string) => {
      // Clear any existing text in the textarea first
      const textarea = document.getElementById(mainTextareaId) as HTMLTextAreaElement;
      if (textarea) {
        textarea.value = '';
        // Force a native input event to ensure all listeners catch the change
        const inputEvent = new Event('input', { bubbles: true });
        textarea.dispatchEvent(inputEvent);
      }

      // Set the active prompt after clearing
      setActivePrompt(text);
    },
    [setActivePrompt],
  );

  // Memoized category buttons to prevent re-rendering on animation updates
  const CategoryButtons = useMemo(
    () => (
      <div
        className={cn(
          'mb-6 flex flex-row flex-wrap gap-2.5 text-sm transition-opacity duration-500 max-sm:justify-evenly',
          animatedCategories ? 'opacity-100' : 'opacity-0',
        )}
        style={{ willChange: 'opacity' }} // Hint for better animation performance
      >
        {promptCategories.map((category) => (
          <button
            key={category.id}
            onClick={() => handleCategoryClick(category.id)}
            data-selected={activeCategoryId === category.id ? 'true' : 'false'}
            className="flex h-9 items-center justify-center gap-1 whitespace-nowrap rounded-xl border border-border-light bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground backdrop-blur-xl transition-colors focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 disabled:pointer-events-none disabled:opacity-50 data-[selected=false]:bg-secondary/30 data-[selected=false]:text-secondary-foreground/90 data-[selected=false]:hover:bg-surface-tertiary data-[selected=true]:hover:bg-primary/80 max-sm:size-16 max-sm:flex-col sm:gap-2 sm:rounded-full [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"
          >
            {category.icon}
            <div>{category.name}</div>
          </button>
        ))}
      </div>
    ),
    [promptCategories, animatedCategories, activeCategoryId, handleCategoryClick],
  );

  if (!currentPrompts.length) {
    return null;
  }

  return (
    <div
      className={cn(
        'mb-6 mt-6 w-full px-4 transition-opacity duration-500 sm:px-0 sm:min-w-[550px] h-[280px] sm:h-[100%]',
        isVisible ? 'opacity-100' : 'opacity-0',
      )}
      style={{ willChange: 'opacity' }} // Hint for better animation performance
    >
      {/* Category Buttons */}
      {CategoryButtons}

      {/* Prompt Suggestions */}
      <div className="flex flex-col text-foreground">
        {displayPrompts.map((prompt, i) => (
          <div
            key={`${activeCategoryId || 'default'}-${i}`}
            className={cn(
              'flex items-start gap-2 border-t border-border-light py-1 transition-all duration-500 first:border-none',
              animatedItems.includes(i)
                ? 'translate-y-0 transform opacity-100'
                : 'translate-y-4 transform opacity-0',
            )}
            style={{ willChange: 'transform, opacity' }} // Hint for better animation performance
          >
            <button
              className="w-full rounded-md py-2 text-left text-text-primary hover:bg-surface-tertiary sm:px-3"
              onClick={() => handleSelectPrompt(prompt.text)}
              aria-label={`Use prompt: ${prompt.text}`}
              tabIndex={animatedItems.includes(i) ? 0 : -1}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSelectPrompt(prompt.text);
                }
              }}
            >
              <span className="line-clamp-2">{prompt.text}</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Default export for the component
 * Used when importing from this file
 */
export default PromptSuggestions;
