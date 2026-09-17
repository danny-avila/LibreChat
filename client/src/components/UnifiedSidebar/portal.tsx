import { atom, useSetAtom } from 'jotai';

export const sidebarPortalTarget = atom<HTMLDivElement | null>(null);

/** Route-owned controls retain their feature context inside the shared sidebar. */
export default function SidebarPortal() {
  const setTarget = useSetAtom(sidebarPortalTarget);
  return <div ref={setTarget} className="min-h-full" />;
}
