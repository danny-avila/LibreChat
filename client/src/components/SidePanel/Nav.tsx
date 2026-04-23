import type { NavLink } from '~/common';
import { useActivePanel, resolveActivePanel } from '~/Providers';

export default function Nav({ links, branding }: { links: NavLink[]; branding?: { logoPath: string; logoAlt: string; appName: string; appSubtitle?: string } }) {
  const { active } = useActivePanel();
  const effectiveActive = resolveActivePanel(active, links);
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto overflow-x-hidden pt-2 text-text-primary">
      {branding && (
        <div className="flex items-center gap-2 px-4 pb-1 pt-3 mb-4">
          <img src={branding.logoPath} alt={branding.logoAlt} className="h-8 w-8 rounded-lg" />
          <div className="flex flex-col">
            <span className="text-sm font-bold text-text-primary">{branding.appName}</span>
            {branding.appSubtitle && (
              <span className="text-[9px] font-medium uppercase tracking-wider text-text-secondary">
                {branding.appSubtitle}
              </span>
            )}
          </div>
        </div>
      )}
      {links.map((link) =>
        link.id === effectiveActive && link.Component ? <link.Component key={link.id} /> : null,
      )}
    </div>
  );
}
