import { useState } from 'react';
import type { SetterOrUpdater } from 'recoil';
import MentionItem from './MentionItem';
import { useLocalize, useCombobox } from '~/hooks';

export default function Mention({
  setShowMentionPopover,
}: {
  setShowMentionPopover: SetterOrUpdater<boolean>;
}) {
  const localize = useLocalize();
  const mentions = ['Alice', 'Bob', 'Charlie'].map((name) => ({ label: name, value: name }));
  const [selectedMention, setSelectedMention] = useState('');

  const { open, setOpen, searchValue, setSearchValue, matches } = useCombobox({
    value: selectedMention,
    options: mentions,
  });

  const handleSelect = (mention) => {
    setSelectedMention(mention.value);
    setSearchValue('');
    setOpen(false);
  };

  return (
    <div className="absolute bottom-16 z-10 w-full space-y-2">
      <div className="popover border-token-border-light rounded-2xl border bg-transparent p-2 shadow-lg">
        <input
          autoFocus
          placeholder={localize('com_ui_mention')}
          className="mb-1 w-full border-0 bg-transparent p-2 text-sm focus:outline-none dark:text-gray-200"
          autoComplete="off"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            setTimeout(() => {
              setOpen(false);
              setShowMentionPopover(false);
            }, 100);
          }}
        />
        {open && (
          <div className="max-h-40 overflow-y-auto">
            {matches.map((mention, index) => (
              <MentionItem
                index={index}
                key={`${mention.value}-${index}`}
                onClick={() => handleSelect(mention)}
                name={mention.label ?? ''}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// const mentions = ['Alice', 'Bob', 'Charlie'];
// import MentionItem from './MentionItem';
// import { useLocalize } from '~/hooks';

// export default function Mention() {
//   const localize = useLocalize();
//   return (
//     <div className="absolute bottom-16 z-10 w-full space-y-2">
//       <div className="popover border-token-border-light rounded-2xl border bg-transparent dark:bg-gray-700 p-2 shadow-lg">
//         <input
//           placeholder={localize('com_ui_mention')}
//           className="mb-1 w-full border-0 bg-transparent dark:bg-gray-700 p-2 text-sm focus:outline-none dark:text-gray-200"
//           autoComplete="off"
//         />
//         <div className="max-h-40 overflow-y-auto">
//           {
//             mentions.map((mention) => (
//               <MentionItem key={mention} name={mention} />
//             ))
//           }
//           {/* <div tabIndex={1}>
//             <div className="group flex h-10 items-center gap-2 rounded-lg px-2 font-medium hover:bg-token-main-surface-secondary text-sm text-token-text-primary">
//               <a target="_blank" className="flex flex-row space-x-2" href="/gpts/editor">
//                 <span className="self-center">
//                   <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" className="icon-sm" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
//                     <line x1="12" y1="5" x2="12" y2="19">
//                     </line>
//                     <line x1="5" y1="12" x2="19" y2="12">
//                     </line>
//                   </svg>
//                 </span>
//                 <span>Create a GPT</span>
//               </a>
//             </div>
//           </div> */}
//         </div>
//       </div>
//     </div>
//   );
// }
