import type { MouseEvent } from 'react';
import { Button } from '~/admin/ui';

export function AddItemButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    onClick();
  };

  return (
    <Button
      htmlType="button"
      type="secondary"
      iconLeft="plus"
      label={label}
      onClick={handleClick}
      disabled={disabled}
    />
  );
}
