import { memo } from 'react';
import * as Ariakit from '@ariakit/react';
import { Zap, Clock, ChevronUp, OctagonPause } from 'lucide-react';
import type { SteeringControls } from '~/hooks/Chat/useSteering';
import { useLocalize } from '~/hooks';

const MENU_ITEM_CLASS =
  'flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-text-primary data-[active-item]:bg-surface-tertiary aria-disabled:cursor-not-allowed aria-disabled:opacity-50';

/**
 * Per-send override menu beside the during-run send button: steer now, queue
 * for after, or interrupt & send (abort the run, then auto-send). The default
 * Enter behavior stays governed by the `duringRunDefaultAction` setting; this
 * menu applies one explicit action to the current composer text.
 */
function DuringRunActionsMenu({
  steering,
  getText,
  onConsumed,
}: {
  steering: SteeringControls;
  getText: () => string;
  onConsumed: () => void;
}) {
  const localize = useLocalize();
  const menu = Ariakit.useMenuStore({ placement: 'top-end' });

  const runAction = (action: (text: string) => boolean | void) => {
    const text = getText().trim();
    if (text.length === 0) {
      return;
    }
    const consumed = action(text);
    if (consumed !== false) {
      onConsumed();
    }
    menu.hide();
  };

  return (
    <>
      <Ariakit.MenuButton
        store={menu}
        aria-label={localize('com_ui_during_run_actions')}
        data-testid="during-run-actions-menu"
        className="rounded-full p-1 text-text-secondary hover:bg-surface-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-xheavy"
      >
        <ChevronUp className="h-4 w-4" aria-hidden="true" />
      </Ariakit.MenuButton>
      <Ariakit.Menu
        store={menu}
        portal
        gutter={8}
        className="z-50 min-w-[14rem] rounded-xl border border-border-light bg-surface-secondary p-1.5 text-text-primary shadow-lg outline-none"
      >
        <Ariakit.MenuItem
          className={MENU_ITEM_CLASS}
          disabled={steering.effectiveAction !== 'steer'}
          onClick={() => runAction((text) => steering.submitSteer(text))}
        >
          <Zap className="h-4 w-4 text-amber-500" aria-hidden="true" />
          {localize('com_ui_steer_send')}
        </Ariakit.MenuItem>
        <Ariakit.MenuItem
          className={MENU_ITEM_CLASS}
          onClick={() => runAction((text) => steering.enqueue(text))}
        >
          <Clock className="h-4 w-4 text-cyan-500" aria-hidden="true" />
          {localize('com_ui_queue_send')}
        </Ariakit.MenuItem>
        <Ariakit.MenuItem
          className={MENU_ITEM_CLASS}
          onClick={() => runAction((text) => steering.interruptAndSend(text))}
        >
          <OctagonPause className="h-4 w-4 text-red-500" aria-hidden="true" />
          {localize('com_ui_interrupt_send')}
        </Ariakit.MenuItem>
      </Ariakit.Menu>
    </>
  );
}

export default memo(DuringRunActionsMenu);
