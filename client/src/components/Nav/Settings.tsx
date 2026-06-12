import { SettingsDialog } from './Settings/index';
import type { TDialogProps } from '~/common';

export default function Settings(props: TDialogProps) {
  return <SettingsDialog {...props} />;
}
