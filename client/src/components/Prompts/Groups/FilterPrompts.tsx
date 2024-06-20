import { useState } from 'react';
import { ListFilter } from 'lucide-react';
import { usePromptGroupsNav, useLocalize } from '~/hooks';
import { Button, Input } from '~/components/ui';
import { cn } from '~/utils';

export default function GroupSidePanel({
  setName,
  className = '',
}: Pick<ReturnType<typeof usePromptGroupsNav>, 'setName'> & {
  className?: string;
}) {
  const localize = useLocalize();
  const [displayName, setDisplayName] = useState('');

  return (
    <div className={cn('flex', className)}>
      <Button variant="outline" size="sm" className="h-10 w-10">
        <ListFilter className="icon-sm" />
      </Button>
      <Input
        placeholder={localize('com_ui_filter_prompts_name')}
        value={displayName}
        onChange={(e) => {
          setDisplayName(e.target.value);
          setName(e.target.value);
        }}
        className="max-w-sm border-border-light"
      />
    </div>
  );
}
