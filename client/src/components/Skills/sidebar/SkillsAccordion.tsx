import { SystemRoles } from 'librechat-data-provider';
import { AdminSettings } from '~/components/Skills/buttons';
import SkillsSidePanel from './SkillsSidePanel';
import { useAuthContext } from '~/hooks';

export default function SkillsAccordion() {
  const { user } = useAuthContext();
  return (
    <div className="flex h-auto w-full flex-col">
      <SkillsSidePanel className="h-auto border-r-0" />
      {user?.role === SystemRoles.ADMIN && (
        <div className="flex w-full items-center justify-end px-4 pb-2">
          <AdminSettings />
        </div>
      )}
    </div>
  );
}
