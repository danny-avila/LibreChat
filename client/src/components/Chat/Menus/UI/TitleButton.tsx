import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Trigger } from '@radix-ui/react-popover';
import useLocalize from '~/hooks/useLocalize';

export default function TitleButton({ primaryText = '', secondaryText = '' }) {
  return (
    <button
      className="group flex items-center gap-2 rounded-lg px-3 py-1.5 text-lg font-medium transition-colors duration-200"
      aria-label={primaryText}
      disabled
    >
      <div>
        <span className="text-text-primary"> {primaryText} </span>
        {!!secondaryText && <span className="text-token-text-secondary">{secondaryText}</span>}
      </div>
    </button>
  );
}

// export default function TitleButton({ primaryText = '', secondaryText = '' }) {
//   const localize = useLocalize();
//   const [isExpanded, setIsExpanded] = useState(false);

//   return (
//     <Trigger asChild>
//       <button
//         className="group flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-lg font-medium transition-colors duration-200 hover:bg-surface-hover radix-state-open:bg-surface-hover"
//         aria-label={localize('com_ui_endpoint_menu')}
//         aria-expanded={isExpanded}
//         role="combobox"
//         aria-haspopup="listbox"
//         aria-controls="llm-endpoint-menu"
//         onClick={() => setIsExpanded(!isExpanded)}
//       >
//         <div>
//           <span className="text-text-primary"> {primaryText} </span>
//           {!!secondaryText && <span className="text-token-text-secondary">{secondaryText}</span>}
//         </div>
//         <ChevronDown className="text-token-text-secondary size-4" />
//       </button>
//     </Trigger>
//   );
// }
