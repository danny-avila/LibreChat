import type { TDangerButtonProps } from '~/common';
import DangerButton from '../DangerButton';

export const ClearChatsButton = ({
  confirmClear,
  className = '',
  showText = true,
  mutation,
  onClick,
}: Pick<
  TDangerButtonProps,
  'confirmClear' | 'mutation' | 'className' | 'showText' | 'onClick'
>) => {
  return (
    <DangerButton
      id="clearConvosBtn"
      mutation={mutation}
      confirmClear={confirmClear}
      className={className}
      showText={showText}
      infoTextCode="com_nav_clear_all_chats"
      actionTextCode="com_ui_clear"
      confirmActionTextCode="com_nav_confirm_clear"
      dataTestIdInitial="clear-convos-initial"
      dataTestIdConfirm="clear-convos-confirm"
      onClick={onClick}
    />
  );
};
