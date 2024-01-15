import { useState } from 'react';
import { cn } from '~/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/Select';

interface SwitcherProps {
  isCollapsed: boolean;
  accounts: {
    label: string;
    email: string;
    icon: React.ReactNode;
  }[];
}

export default function Switcher({ isCollapsed, accounts }: SwitcherProps) {
  const [selectedAccount, setSelectedAccount] = useState<string>(accounts[0].email);

  return (
    <Select defaultValue={selectedAccount} onValueChange={setSelectedAccount}>
      <SelectTrigger
        className={cn(
          'flex items-center gap-2 [&>span]:line-clamp-1 [&>span]:flex [&>span]:w-full [&>span]:items-center [&>span]:gap-1 [&>span]:truncate [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0',
          isCollapsed
            ? 'flex h-9 w-9 shrink-0 items-center justify-center p-0 [&>span]:w-auto [&>svg]:hidden'
            : '',
          'bg-white',
        )}
        aria-label="Select account"
      >
        <SelectValue placeholder="Select an account">
          {accounts.find((account) => account.email === selectedAccount)?.icon}
          <span className={cn('ml-2', isCollapsed ? 'hidden' : '')}>
            {accounts.find((account) => account.email === selectedAccount)?.label}
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="bg-white">
        {accounts.map((account) => (
          <SelectItem key={account.email} value={account.email}>
            <div className="[&_svg]:text-foreground flex items-center gap-3 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0 ">
              {account.icon}
              {account.email}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
