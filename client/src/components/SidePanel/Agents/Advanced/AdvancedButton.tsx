import React from 'react';
import { Settings2 } from 'lucide-react';
import { Button } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { Panel } from '~/common';

interface AdvancedButtonProps {
  setActivePanel: (panel: Panel) => void;
}

const AdvancedButton: React.FC<AdvancedButtonProps> = ({ setActivePanel }) => {
  const localize = useLocalize();

  return (
    <Button
      size={'sm'}
      variant={'outline'}
      className="btn btn-neutral border-token-border-light relative h-9 w-full gap-1 rounded-lg font-medium focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
      onClick={() => setActivePanel(Panel.advanced)}
      aria-label={localize('com_ui_advanced')}
    >
      <Settings2 className="h-4 w-4 cursor-pointer" aria-hidden="true" />
      {localize('com_ui_advanced')}
    </Button>
  );
};

export default AdvancedButton;
