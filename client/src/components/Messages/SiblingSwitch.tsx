import { useSetRecoilState } from 'recoil';
import type { TMessageProps } from '~/common';
import store from '~/store';

type TSiblingSwitchProps = Pick<
  TMessageProps,
  'message' | 'siblingIdx' | 'siblingCount' | 'setSiblingIdx'
>;

export default function SiblingSwitch({
  message,
  siblingIdx,
  siblingCount,
  setSiblingIdx,
}: TSiblingSwitchProps) {
  const setLatestMessage = useSetRecoilState(store.latestMessage);

  if (siblingIdx === undefined) {
    return null;
  } else if (siblingCount === undefined) {
    return null;
  }

  const previous = () => {
    setSiblingIdx && setSiblingIdx(siblingIdx - 1);
    message && setLatestMessage(message);
  };

  const next = () => {
    setSiblingIdx && setSiblingIdx(siblingIdx + 1);
    message && setLatestMessage(message);
  };

  return siblingCount > 1 ? (
    <>
      <button
        className="disabled:text-gray-300 dark:text-white dark:disabled:text-gray-400"
        onClick={previous}
        disabled={siblingIdx == 0}
      >
        <svg
          stroke="currentColor"
          fill="none"
          strokeWidth="1.5"
          viewBox="0 0 24 24"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3 w-3"
          height="1em"
          width="1em"
          xmlns="http://www.w3.org/2000/svg"
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <span className="flex-shrink-0 flex-grow">
        {siblingIdx + 1}/{siblingCount}
      </span>
      <button
        className="disabled:text-gray-300 dark:text-white dark:disabled:text-gray-400"
        onClick={next}
        disabled={siblingIdx == siblingCount - 1}
      >
        <svg
          stroke="currentColor"
          fill="none"
          strokeWidth="1.5"
          viewBox="0 0 24 24"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3 w-3"
          height="1em"
          width="1em"
          xmlns="http://www.w3.org/2000/svg"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </>
  ) : null;
}
