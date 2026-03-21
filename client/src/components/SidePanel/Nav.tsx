import type { NavLink } from '~/common';
import { useActivePanel } from '~/Providers';

export default function Nav({ links }: { links: NavLink[] }) {
  const { active } = useActivePanel();
  return (
    <div className="hide-scrollbar flex h-full min-h-0 flex-col overflow-y-auto overflow-x-hidden py-1 text-text-primary">
      {links.map((link) =>
        link.id === active && link.Component ? <link.Component key={link.id} /> : null,
      )}
    </div>
  );
}
