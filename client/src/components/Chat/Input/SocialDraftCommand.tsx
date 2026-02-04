import { useEffect, memo } from 'react';
import { useSetRecoilState } from 'recoil';
import { socialDraftState } from '~/store/socialDraft';
import { removeCharIfLast } from '~/utils';

const commandChar = '/';
const commandText = 'social-draft';

function SocialDraftCommand({
  index,
  textAreaRef,
}: {
  index: number;
  textAreaRef: React.MutableRefObject<HTMLTextAreaElement | null>;
}) {
  const setSocialDraftState = useSetRecoilState(socialDraftState);
  const showSocialDraft = import.meta.env.VITE_SOCIAL_MEDIA_AUTOMATION === 'true';

  useEffect(() => {
    if (!showSocialDraft || !textAreaRef.current) return;

    const textarea = textAreaRef.current;
    const handleKeyDown = (e: KeyboardEvent) => {
      const value = textarea.value.trim();
      const commandMatch = `${commandChar}${commandText}`;

      if (e.key === 'Enter' && value === commandMatch) {
        e.preventDefault();
        e.stopPropagation();
        removeCharIfLast(textarea, commandChar);
        textarea.value = '';
        setSocialDraftState({ isOpen: true });
      }
    };

    textarea.addEventListener('keydown', handleKeyDown, true);
    return () => textarea.removeEventListener('keydown', handleKeyDown, true);
  }, [showSocialDraft, textAreaRef, setSocialDraftState]);

  return null;
}

export default memo(SocialDraftCommand);
