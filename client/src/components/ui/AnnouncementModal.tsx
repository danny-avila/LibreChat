import { Bot, Sparkles } from 'lucide-react';
import { Button, OGDialog, DialogTemplate } from '@librechat/client';
import type { TAnnouncementConfig } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';

const BADGE_ACCENT_CLASSES = [
  'border-violet-500/25 bg-violet-500/10 text-violet-900 dark:text-violet-100',
  'border-emerald-500/25 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100',
  'border-amber-500/30 bg-amber-500/10 text-amber-950 dark:text-amber-100',
];

const STRIPE_ACCENT_CLASSES = [
  'from-violet-500/90 to-violet-500/25',
  'from-emerald-500/90 to-emerald-500/25',
  'from-amber-500/90 to-amber-500/25',
];

type AnnouncementModalProps = {
  open: boolean;
  announcement: TAnnouncementConfig;
  onDismiss: () => void;
};

export default function AnnouncementModal({
  open,
  announcement,
  onDismiss,
}: AnnouncementModalProps) {
  const localize = useLocalize();

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      onDismiss();
    }
  };

  const title = announcement.title ?? localize('com_ui_announcement_default_title');
  const description =
    announcement.description != null && announcement.description !== ''
      ? announcement.description
      : undefined;

  const hasModels = (announcement.models?.length ?? 0) > 0;
  const descriptionForDialog = hasModels ? undefined : description;

  return (
    <OGDialog open={open} onOpenChange={handleOpenChange}>
      <DialogTemplate
        title={title}
        description={descriptionForDialog}
        className="border-border-light/80 w-11/12 max-w-xl overflow-hidden border shadow-xl sm:w-4/5 md:max-w-xl"
        showCloseButton={true}
        showCancelButton={false}
        main={
          announcement.models && announcement.models.length > 0 ? (
            <section
              tabIndex={0}
              className="max-h-[50vh] overflow-y-auto px-4 pb-1 pt-0"
              aria-label={title}
            >
              <div className="border-border-light/60 bg-surface-secondary/40 dark:bg-surface-tertiary/30 mb-4 flex items-center gap-3 rounded-xl border px-3 py-2.5">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
                  <Sparkles className="size-4" aria-hidden />
                </div>
                <p className="text-sm leading-snug text-text-secondary">
                  {description != null && description !== ''
                    ? description
                    : localize('com_ui_announcement_models_hint')}
                </p>
              </div>
              <ul className="space-y-3">
                {announcement.models.map((model, index) => (
                  <li
                    key={`${model.name}-${index}`}
                    className="from-surface-secondary/95 to-surface-secondary/40 dark:from-surface-tertiary/50 dark:to-surface-secondary/30 group relative overflow-hidden rounded-xl border border-border-medium bg-gradient-to-br p-4 pl-5 shadow-sm transition-[border-color,box-shadow] hover:border-primary/35 hover:shadow-md"
                  >
                    <span
                      className={`absolute bottom-2 left-0 top-2 w-1 rounded-full bg-gradient-to-b ${STRIPE_ACCENT_CLASSES[index % STRIPE_ACCENT_CLASSES.length]}`}
                      aria-hidden
                    />
                    <div className="flex gap-3 pl-1">
                      <Bot
                        className="mt-0.5 size-4 shrink-0 text-text-tertiary opacity-80 group-hover:text-primary group-hover:opacity-100"
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 gap-y-1">
                          <span className="text-base font-semibold tracking-tight text-text-primary">
                            {model.name}
                          </span>
                          {model.badge != null && model.badge !== '' ? (
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide ${BADGE_ACCENT_CLASSES[index % BADGE_ACCENT_CLASSES.length]}`}
                            >
                              {model.badge}
                            </span>
                          ) : null}
                        </div>
                        {model.description != null && model.description !== '' ? (
                          <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
                            {model.description}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null
        }
        buttons={
          <Button
            type="button"
            variant="default"
            className="min-w-[8.5rem] font-semibold"
            onClick={onDismiss}
          >
            {localize('com_ui_understood')}
          </Button>
        }
      />
    </OGDialog>
  );
}
