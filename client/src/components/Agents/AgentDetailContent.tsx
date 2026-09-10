import React, { useId, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useHref, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Constants, EModelEndpoint } from 'librechat-data-provider';
import { ArrowUpRight, MessageSquarePlus, Pin, PinOff, X } from 'lucide-react';
import {
  Button,
  Spinner,
  OGDialogClose,
  OGDialogContent,
  OGDialogDescription,
  OGDialogHeader,
  OGDialogTitle,
} from '@librechat/client';
import type t from 'librechat-data-provider';
import {
  agentMorphId,
  DETAIL_ENTER,
  DETAIL_EXIT,
  DETAIL_FADE_ENTER,
  DETAIL_FADE_INITIAL,
  DETAIL_INITIAL,
  DIALOG_MORPH_DEPENDENCY,
  MORPH_OPEN_TRANSITION,
} from './morph';
import AgentContact, { resolveAgentContact } from './AgentContact';
import { clearMessagesCache } from '~/utils/messages';
import { useFavorites, useLocalize } from '~/hooks';
import { cn, renderAgentAvatar } from '~/utils';
import AgentCategoryBadge from './Category';
import CopyLink from './CopyLink';
import store from '~/store';

interface AgentDetailContentProps {
  agent: t.Agent;
  /**
   * Set while the dialog shares its layout with the originating grid card:
   * `open` expands out of the card, `closing` hands the surface back. Omit it
   * when there is no source card to morph from and the dialog should just fade.
   */
  morph?: 'open' | 'closing';
  /**
   * The theme's surface radius in pixels, supplied with `morph` so the shared
   * surface holds the same corner as the card it came from while it scales. At
   * rest the stylesheet's `rounded-theme-surface` governs.
   */
  surfaceRadius?: number;
}

const AgentDetailContent: React.FC<AgentDetailContentProps> = ({ agent, morph, surfaceRadius }) => {
  const localize = useLocalize();
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const id = useId();
  const { isFavoriteAgent, toggleFavoriteAgent, isUpdating } = useFavorites();
  const isFavorite = isFavoriteAgent(agent.id);
  const favoriteLabel = localize(isFavorite ? 'com_ui_unpin' : 'com_ui_pin');
  const FavoriteIcon = isFavorite ? PinOff : Pin;

  const conversationStarters = useMemo(() => {
    const starters: string[] = [];
    for (const value of agent.conversation_starters ?? []) {
      const starter = value.trim();
      if (starter) {
        starters.push(starter);
      }
      if (starters.length === Constants.MAX_CONVO_STARTERS) {
        break;
      }
    }
    return starters;
  }, [agent.conversation_starters]);
  const chatSearch = useMemo(
    () => new URLSearchParams({ endpoint: EModelEndpoint.agents, agent_id: agent.id }).toString(),
    [agent.id],
  );
  const queryClient = useQueryClient();
  const clearAllConversations = store.useClearConvoState();
  const chatHref = useHref({ pathname: '/c/new', search: `?${chatSearch}` });

  const handleStartChat = (prompt?: string) => {
    const params = new URLSearchParams(chatSearch);
    if (prompt) {
      params.set('prompt', prompt);
    }
    /* The chat route initializes from these query params through `useQueryParams`, which
       keeps added conversations and leaves the new-chat message cache alone. Starting an
       agent from the marketplace is a new conversation with that agent, not another column
       beside whatever was already open and not the transcript the last one left under
       `NEW_CONVO` — both are dropped here the way `newConversation` used to drop them. */
    clearAllConversations(true);
    clearMessagesCache(queryClient, Constants.NEW_CONVO);
    navigate({ pathname: '/c/new', search: `?${params.toString()}` });
  };

  const shareUrl = useMemo(() => new URL(chatHref, window.location.origin).toString(), [chatHref]);

  /* The dialog keeps its own layout: only the surface and the identity fields
     travel, and they animate position (not scale) so the dialog's typography is
     never a stretched copy of the card's. */
  const morphing = morph != null && reducedMotion !== true;
  const shared = {
    layoutCrossfade: false,
    /* The identity fields travel between two independently animating layouts,
       so they must resolve against the viewport, not against whichever section
       currently contains them. */
    layoutAnchor: false,
    layoutDependency: DIALOG_MORPH_DEPENDENCY,
    transition: MORPH_OPEN_TRANSITION,
  } as const;
  /**
   * Sections that are pinned to the dialog's own layout. Being projection nodes
   * keeps them scale-corrected inside the expanding surface, so they sit at
   * their final position and typography from the first frame and are revealed
   * by the surface's clip instead of stretching or spilling outside it.
   */
  const pinned = morphing
    ? ({
        layout: 'position',
        layoutDependency: DIALOG_MORPH_DEPENDENCY,
        transition: MORPH_OPEN_TRANSITION,
      } as const)
    : {};
  /** Controls that exist only here, introduced once the geometry is under way. */
  const detail = morphing
    ? { initial: DETAIL_INITIAL, animate: morph === 'closing' ? DETAIL_EXIT : DETAIL_ENTER }
    : { initial: DETAIL_FADE_INITIAL, animate: DETAIL_FADE_ENTER };
  const contact = resolveAgentContact(agent);

  return (
    <OGDialogContent
      bare
      forceMount={morphing ? true : undefined}
      className={cn(
        'inset-0 m-auto h-fit w-11/12 max-w-3xl',
        !morphing &&
          'duration-150 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      )}
      /* While morphing, the dim is owned by the grid: it has to outlive this
         dialog's mount so it can fade out across the whole contraction. */
      overlayClassName={morphing ? 'bg-transparent' : undefined}
      showCloseButton={false}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        titleRef.current?.focus();
      }}
    >
      <motion.div
        layoutId={morphing ? agentMorphId('surface', agent.id) : undefined}
        style={surfaceRadius == null ? undefined : { borderRadius: surfaceRadius }}
        className="relative flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-theme-surface bg-surface-dialog shadow-lg high-contrast:border high-contrast:border-solid high-contrast:border-border-medium high-contrast:shadow-none"
        {...shared}
      >
        {/* Card-coloured wash so the surface interpolates its fill and border
            instead of popping to the dialog colour at the first frame. */}
        <motion.div
          aria-hidden="true"
          initial={morphing ? { opacity: 1 } : false}
          animate={{ opacity: morphing && morph === 'closing' ? 1 : 0 }}
          transition={MORPH_OPEN_TRANSITION}
          className="pointer-events-none absolute inset-0 border border-border-light bg-surface-secondary"
        />

        <motion.div {...pinned} className="relative z-10 shrink-0 px-5 pb-6 pt-5 sm:px-6 sm:pt-6">
          <div className="flex items-start justify-between gap-4">
            {agent.category != null && agent.category !== '' && (
              /* The box has to hug the pill on both sides of the morph: a
                 full-width box here would put the pill's travel on the box's
                 centre and throw it across the header on the first frame. */
              <motion.div
                layout="position"
                layoutId={morphing ? agentMorphId('category', agent.id) : undefined}
                className="min-w-0"
                {...shared}
              >
                <AgentCategoryBadge category={agent.category} />
              </motion.div>
            )}
            <motion.div {...detail} className="ms-auto shrink-0">
              <OGDialogClose asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="-mr-2 -mt-2 shrink-0 self-start rtl:-ml-2 rtl:mr-0"
                  aria-label={localize('com_ui_close')}
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              </OGDialogClose>
            </motion.div>
          </div>

          <OGDialogHeader className="mt-5 text-left sm:text-left rtl:text-right sm:rtl:text-right">
            <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
              <motion.div
                layoutId={morphing ? agentMorphId('avatar', agent.id) : undefined}
                className="shrink-0"
                {...shared}
              >
                {renderAgentAvatar(agent, {
                  size: 'md',
                  showBorder: false,
                  className: 'rounded-full bg-surface-tertiary ring-1 ring-border-light',
                })}
              </motion.div>
              <div className="min-w-0 flex-1">
                <motion.div
                  layout
                  layoutId={morphing ? agentMorphId('title', agent.id) : undefined}
                  {...shared}
                >
                  <OGDialogTitle
                    ref={titleRef}
                    tabIndex={-1}
                    className="break-words text-2xl font-semibold leading-tight text-text-primary outline-none sm:text-3xl"
                  >
                    {agent.name?.trim() || localize('com_ui_agent')}
                  </OGDialogTitle>
                </motion.div>
                {contact != null && (
                  <motion.div
                    layout="position"
                    layoutId={morphing ? agentMorphId('owner', agent.id) : undefined}
                    className="mt-3"
                    {...shared}
                  >
                    <AgentContact agent={agent} compact className="text-sm" />
                  </motion.div>
                )}
              </div>
            </div>
            <OGDialogDescription className="sr-only">
              {localize('com_agents_details_hint')}
            </OGDialogDescription>
          </OGDialogHeader>
        </motion.div>

        <motion.div
          {...pinned}
          layoutScroll
          className="relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-6 sm:pb-6"
        >
          <section aria-labelledby={`${id}-about`}>
            <motion.div {...detail} className="border-t border-border-light pt-5">
              <h3 id={`${id}-about`} className="text-sm font-semibold text-text-secondary">
                {localize('com_agents_about')}
              </h3>
            </motion.div>
            {/* Same copy as the card's blurb, so it is handed over rather than
                introduced: the surface's clip reveals the extra lines the card
                had no room for as it expands. */}
            <motion.p
              layout="position"
              layoutId={morphing ? agentMorphId('description', agent.id) : undefined}
              className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-text-primary sm:text-base"
              {...shared}
            >
              {agent.description?.trim() || localize('com_agents_description_empty')}
            </motion.p>
          </section>

          {conversationStarters.length > 0 && (
            <motion.section {...detail} className="mt-6" aria-labelledby={`${id}-starters`}>
              <h3 id={`${id}-starters`} className="text-sm font-semibold text-text-primary">
                {localize('com_agents_starters_heading')}
              </h3>
              <p className="mt-1 text-sm leading-6 text-text-secondary">
                {localize('com_agents_starters_hint')}
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {conversationStarters.map((starter, index) => (
                  <Button
                    key={`${starter}-${index}`}
                    variant="outline"
                    className="h-auto min-h-14 items-start justify-between gap-3 whitespace-normal px-4 py-3 text-left rtl:text-right"
                    onClick={() => handleStartChat(starter)}
                  >
                    <span className="min-w-0 break-words">{starter}</span>
                    <ArrowUpRight className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  </Button>
                ))}
              </div>
            </motion.section>
          )}
        </motion.div>

        <motion.div {...pinned} className="relative z-10 shrink-0">
          <motion.div
            {...detail}
            className="grid gap-3 p-5 sm:flex sm:items-center sm:justify-between sm:p-6"
          >
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Button
                variant="outline"
                aria-label={favoriteLabel}
                aria-pressed={isFavorite}
                aria-busy={isUpdating}
                disabled={isUpdating}
                onClick={() => toggleFavoriteAgent(agent.id)}
                className="min-w-0 px-3"
              >
                {isUpdating ? (
                  <Spinner className="size-4 shrink-0" aria-hidden="true" />
                ) : (
                  <FavoriteIcon className="size-4 shrink-0" aria-hidden="true" />
                )}
                <span className="truncate">{favoriteLabel}</span>
              </Button>
              <CopyLink url={shareUrl} />
            </div>
            <Button className="w-full sm:w-auto" onClick={() => handleStartChat()}>
              <MessageSquarePlus className="size-4" aria-hidden="true" />
              {localize('com_agents_start_chat')}
            </Button>
          </motion.div>
        </motion.div>
      </motion.div>
    </OGDialogContent>
  );
};

export default AgentDetailContent;
