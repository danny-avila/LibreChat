import NewJerseyLogo from '~/nj/components/NewJerseyLogo';
import { OpenSidebar } from '~/components/Chat/Menus';

/**
 * A version of `Header` that just has the NewJersey logo & sidebar button.
 *
 * (Should just copy `Header`'s source code, minus those components.)
 */
export default function SimpleHeader() {
  return (
    <div className="via-presentation/70 md:from-presentation/80 md:via-presentation/50 2xl:from-presentation/0 absolute top-0 z-10 flex h-[52px] w-full items-center justify-between bg-gradient-to-b from-presentation to-transparent p-2 font-semibold text-text-primary 2xl:via-transparent">
      <div className="hide-scrollbar flex w-full items-center justify-between gap-2 overflow-x-auto">
        <div className="mx-1 flex items-center">
          <NewJerseyLogo />
          <OpenSidebar className="md:hidden" />
        </div>
      </div>
      {/* Empty div for spacing */}
      <div />
    </div>
  );
}
