import { useState } from 'react';
import { ListFilter } from 'lucide-react';
import { Button, Input } from '~/components/ui';
import { usePromptGroupsNav } from '~/hooks';
import { cn } from '~/utils';

export default function GroupSidePanel({
  setName,
  className = '',
}: Pick<ReturnType<typeof usePromptGroupsNav>, 'setName'> & {
  className?: string;
}) {
  const [displayName, setDisplayName] = useState('');

  return (
    <div className={cn('flex', className)}>
      <Button variant="outline" size="sm" className="h-10 w-10">
        <ListFilter className="icon-sm" />
      </Button>
      <Input
        placeholder="Filter prompts..."
        value={displayName}
        onChange={(e) => {
          setDisplayName(e.target.value);
          setName(e.target.value);
        }}
        className="max-w-sm dark:border-gray-500"
      />
    </div>
  );
}
