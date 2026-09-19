import { ExternalLink } from 'lucide-react';
import { Label, Button } from '@librechat/client';
import { useMediaSessionGuard } from '~/components/Media/session';
import { mediaSessionScope } from '~/routes/mediaHandoff';
import MediaRecovery from '~/components/Media/Recovery';
import { useGetStartupConfig } from '~/data-provider';
import { useLocalize, useAuthContext } from '~/hooks';

export default function AdminPanel() {
  const localize = useLocalize();
  const { data: startupConfig } = useGetStartupConfig();
  const adminPanelURL = startupConfig?.adminPanelURL ?? '';
  const { user, isAuthenticated } = useAuthContext();
  const scope = user ? mediaSessionScope(user) : undefined;
  const isCurrentSession = useMediaSessionGuard(scope, isAuthenticated && !!adminPanelURL);

  if (!adminPanelURL || !scope) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label id="admin-panel-label">{localize('com_ui_admin_panel')}</Label>
        <Button asChild variant="outline" aria-labelledby="admin-panel-label">
          <a href={adminPanelURL} target="_blank" rel="noopener noreferrer">
            {localize('com_ui_open_var', { 0: localize('com_ui_admin_panel') })}
            <ExternalLink className="size-4" aria-hidden="true" />
          </a>
        </Button>
      </div>
      <MediaRecovery key={scope} host={{ scope, isCurrentSession }} />
    </div>
  );
}
