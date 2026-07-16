import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X, Rocket } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from '@librechat/client';
import { usePublishArtifactAppMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { useNavigate } from 'react-router-dom';
import type { Artifact } from '~/common';

const formSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().max(2000).optional(),
  visibility: z.enum(['private', 'restricted', 'tenant', 'public']).default('private'),
  allowEmbed: z.boolean().default(false),
  allowFork: z.boolean().default(false),
  allowAnonymousView: z.boolean().default(false),
  changelog: z.string().optional(),
});
type FormValues = z.infer<typeof formSchema>;

interface PublishAppDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  artifact: Artifact;
  conversationId?: string;
  messageId?: string;
}

const STEPS = ['general', 'security', 'publish'] as const;
type Step = (typeof STEPS)[number];

export default function PublishAppDialog({
  open,
  onOpenChange,
  artifact,
  conversationId,
  messageId,
}: PublishAppDialogProps) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('general');
  const publishMutation = usePublishArtifactAppMutation();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: artifact.title ?? '',
      description: '',
      visibility: 'private',
      allowEmbed: false,
      allowFork: false,
      allowAnonymousView: false,
      changelog: '',
    },
  });

  const visibility = watch('visibility');

  const onSubmit = handleSubmit(async (data) => {
    if (step !== 'publish') {
      setStep(STEPS[STEPS.indexOf(step) + 1]);
      return;
    }
    try {
      const result = await publishMutation.mutateAsync({
        title: data.title,
        description: data.description,
        visibility: data.visibility,
        allowEmbed: data.allowEmbed,
        allowFork: data.allowFork,
        allowAnonymousView: data.allowAnonymousView,
        changelog: data.changelog,
        artifact: {
          type: artifact.type as 'react' | 'html' | 'mermaid',
          content: artifact.content ?? '',
          title: artifact.title,
        },
        source: conversationId
          ? {
              conversationId,
              messageId,
              originalArtifactId: artifact.id,
            }
          : undefined,
      });
      onOpenChange(false);
      navigate(`/apps/${result.app.artifactAppId}`);
    } catch {
      // error handled via publishMutation.isError
    }
  });

  const stepLabel: Record<Step, string> = {
    general: localize('com_ui_artifact_app_step_general'),
    security: localize('com_ui_artifact_app_step_security'),
    publish: localize('com_ui_artifact_app_step_publish'),
  };

  const stepIndex = STEPS.indexOf(step);
  const isLastStep = step === 'publish';

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-surface-primary p-6 shadow-2xl focus:outline-none">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Rocket size={18} className="text-text-primary" aria-hidden="true" />
              <Dialog.Title className="text-base font-semibold text-text-primary">
                {localize('com_ui_artifact_app_publish')}
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                aria-label={localize('com_ui_close')}
              >
                <X size={16} aria-hidden="true" />
              </Button>
            </Dialog.Close>
          </div>

          <nav aria-label="Progress" className="mb-6 flex items-center gap-2">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                    i < stepIndex
                      ? 'bg-green-500 text-white'
                      : i === stepIndex
                        ? 'bg-blue-500 text-white'
                        : 'bg-surface-secondary text-text-secondary'
                  }`}
                >
                  {i < stepIndex ? '✓' : i + 1}
                </div>
                <span
                  className={`text-xs ${
                    i === stepIndex ? 'font-semibold text-text-primary' : 'text-text-secondary'
                  }`}
                >
                  {stepLabel[s]}
                </span>
                {i < STEPS.length - 1 && <div className="h-px w-6 bg-border-light" />}
              </div>
            ))}
          </nav>

          <form onSubmit={onSubmit} noValidate>
            {step === 'general' && (
              <div className="space-y-4">
                <div>
                  <label
                    className="mb-1 block text-sm font-medium text-text-primary"
                    htmlFor="pub-title"
                  >
                    Title *
                  </label>
                  <input
                    id="pub-title"
                    className="w-full rounded-lg border border-border-medium bg-surface-secondary px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-ring"
                    {...register('title')}
                  />
                  {errors.title && (
                    <p className="mt-1 text-xs text-red-500">{errors.title.message}</p>
                  )}
                </div>
                <div>
                  <label
                    className="mb-1 block text-sm font-medium text-text-primary"
                    htmlFor="pub-desc"
                  >
                    Description
                  </label>
                  <textarea
                    id="pub-desc"
                    rows={3}
                    className="w-full resize-none rounded-lg border border-border-medium bg-surface-secondary px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-ring"
                    {...register('description')}
                  />
                </div>
                <div>
                  <label
                    className="mb-1 block text-sm font-medium text-text-primary"
                    htmlFor="pub-changelog"
                  >
                    Changelog / notes for v1
                  </label>
                  <input
                    id="pub-changelog"
                    className="w-full rounded-lg border border-border-medium bg-surface-secondary px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-ring"
                    {...register('changelog')}
                  />
                </div>
              </div>
            )}

            {step === 'security' && (
              <div className="space-y-4">
                <div>
                  <label
                    className="mb-1 block text-sm font-medium text-text-primary"
                    htmlFor="pub-visibility"
                  >
                    Visibility
                  </label>
                  <select
                    id="pub-visibility"
                    className="w-full rounded-lg border border-border-medium bg-surface-secondary px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-ring"
                    {...register('visibility')}
                  >
                    <option value="private">Private – only you</option>
                    <option value="restricted">Restricted – shared users only</option>
                    <option value="tenant">Tenant – everyone in your org</option>
                    <option value="public">Public</option>
                  </select>
                </div>
                <div className="space-y-2">
                  {(['allowEmbed', 'allowFork', 'allowAnonymousView'] as const).map((field) => (
                    <label
                      key={field}
                      className="flex cursor-pointer items-center gap-2 text-sm text-text-primary"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-blue-500"
                        {...register(field)}
                      />
                      {field === 'allowEmbed' && 'Allow embedding in iframes'}
                      {field === 'allowFork' && 'Allow others to fork this app'}
                      {field === 'allowAnonymousView' && (
                        <span>
                          Allow anonymous view{' '}
                          {visibility !== 'public' && (
                            <span className="text-text-secondary">
                              (only relevant when visibility = public)
                            </span>
                          )}
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {step === 'publish' && (
              <div className="space-y-3">
                <p className="text-sm text-text-secondary">
                  Review your settings before publishing.
                </p>
                <dl className="divide-y divide-border-light rounded-xl border border-border-light">
                  {[
                    ['Title', watch('title')],
                    ['Description', watch('description') || '—'],
                    ['Visibility', watch('visibility')],
                    ['Allow embed', watch('allowEmbed') ? 'Yes' : 'No'],
                    ['Allow fork', watch('allowFork') ? 'Yes' : 'No'],
                    ['Anonymous view', watch('allowAnonymousView') ? 'Yes' : 'No'],
                  ].map(([k, v]) => (
                    <div key={String(k)} className="flex justify-between px-3 py-2">
                      <dt className="text-sm text-text-secondary">{k}</dt>
                      <dd className="text-sm font-medium text-text-primary">{String(v)}</dd>
                    </div>
                  ))}
                </dl>
                {publishMutation.isError && (
                  <p className="text-xs text-red-500">Failed to publish. Please try again.</p>
                )}
              </div>
            )}

            <div className="mt-6 flex justify-between gap-3">
              {stepIndex > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setStep(STEPS[stepIndex - 1])}
                >
                  Back
                </Button>
              ) : (
                <div />
              )}
              <Button type="submit" disabled={publishMutation.isLoading}>
                {isLastStep
                  ? publishMutation.isLoading
                    ? 'Publishing…'
                    : localize('com_ui_artifact_app_publish')
                  : 'Next'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
