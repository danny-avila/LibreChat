import { useSetAtom } from 'jotai';
import { Link } from 'react-router-dom';
import { Label, Button } from '@librechat/client';
import { settingsOpenAtom } from '~/components/Nav/Settings';
import { useLocalize } from '~/hooks';

/** Opens the built-in admin panel; the registry shows it only to someone who can use it. */
export default function AdminPanel() {
  const localize = useLocalize();
  const setShowSettings = useSetAtom(settingsOpenAtom);

  return (
    <div className="flex items-center justify-between">
      <Label id="admin-panel-label">{localize('com_ui_admin_panel')}</Label>
      <Button asChild variant="outline" aria-labelledby="admin-panel-label">
        <Link to="/admin" onClick={() => setShowSettings(false)}>
          {localize('com_ui_open_var', { 0: localize('com_ui_admin_panel') })}
        </Link>
      </Button>
    </div>
  );
}
