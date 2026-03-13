import { useMediaQuery } from '@librechat/client';
import { AnimatePresence, motion } from 'framer-motion';
import { LogOut } from 'lucide-react';
import { HeaderNewChat } from './Menus';
import ModelSelector from './Menus/Endpoints/ModelSelector';
import { useGetStartupConfig } from '~/data-provider';
import ExportAndShareMenu from './ExportAndShareMenu';
import { TemporaryChat } from './TemporaryChat';
import { useAuthContext, useLocalize } from '~/hooks';
import { cn } from '~/utils';

export default function Header() {
  const localize = useLocalize();
  const { data: startupConfig } = useGetStartupConfig();
  const { logout } = useAuthContext();

  const isSmallScreen = useMediaQuery('(max-width: 768px)');

  return (
    <div className="via-presentation/70 md:from-presentation/80 md:via-presentation/50 2xl:from-presentation/0 absolute top-0 z-10 flex h-14 w-full items-center justify-between bg-gradient-to-b from-presentation to-transparent p-2 font-semibold text-text-primary 2xl:via-transparent">
      <div className="hide-scrollbar flex w-full items-center justify-between gap-2 overflow-x-auto">
        <div className="mx-1 flex items-center">
          <AnimatePresence initial={false}>
            <motion.div
              className="flex items-center gap-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              key="header-buttons"
            >
              <HeaderNewChat />
            </motion.div>
          </AnimatePresence>
            <div
              className={cn(
                'flex items-center gap-2 transition-all duration-200 ease-in-out pl-2',
              )}
            >
              <ModelSelector startupConfig={startupConfig} />
              {isSmallScreen && (
                <>
                  <ExportAndShareMenu
                    isSharedButtonEnabled={startupConfig?.sharedLinksEnabled ?? false}
                  />
                  <TemporaryChat />
                  <button
                    type="button"
                    onClick={() => logout('/login?redirect=false')}
                    className="inline-flex size-10 flex-shrink-0 items-center justify-center rounded-xl border border-border-light bg-presentation text-text-primary transition-all ease-in-out hover:bg-surface-tertiary disabled:pointer-events-none disabled:opacity-50"
                    aria-label={localize('com_nav_log_out')}
                    title={localize('com_nav_log_out')}
                  >
                    <LogOut className="icon-lg text-text-primary" aria-hidden="true" />
                  </button>
                </>
              )}
            </div>
        </div>

        {!isSmallScreen && (
          <div className="flex items-center gap-2">
            <ExportAndShareMenu
              isSharedButtonEnabled={startupConfig?.sharedLinksEnabled ?? false}
            />
            <TemporaryChat />
            <button
              type="button"
              onClick={() => logout('/login?redirect=false')}
              className="inline-flex h-10 flex-shrink-0 items-center justify-center gap-2 rounded-xl border border-border-light bg-presentation px-3 text-text-primary transition-all ease-in-out hover:bg-surface-tertiary disabled:pointer-events-none disabled:opacity-50"
              aria-label={localize('com_nav_log_out')}
              title={localize('com_nav_log_out')}
            >
              <LogOut className="icon-md text-text-primary" aria-hidden="true" />
              <span className="text-sm">{localize('com_nav_log_out')}</span>
            </button>
          </div>
        )}
      </div>
      {/* Empty div for spacing */}
      <div />
    </div>
  );
}
