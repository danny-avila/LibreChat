import type { TDialogProps } from '~/common';
import { SettingsDialog } from './Settings/index';

export default function Settings(props: TDialogProps) {
  return <SettingsDialog {...props} />;
}
