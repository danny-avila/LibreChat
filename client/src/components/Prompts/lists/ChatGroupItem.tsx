import { useState, useMemo, memo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { PermissionBits, ResourceType } from 'librechat-data-provider';
import { Eye, Pencil, EarthIcon } from 'lucide-react';
import { Button, TooltipAnchor } from '@librechat/client';
import type { TPromptGroup } from 'librechat-data-provider';
import { useLocalize, useSubmitMessage, useResourcePermissions } from '~/hooks';
import VariableDialog from '../dialogs/VariableDialog';
import PreviewPrompt from '../dialogs/PreviewPrompt';
import ListCard from './ListCard';
import { detectVariables } from '~/utils';

function ChatGroupItem({
  group,
  instanceProjectId,
}: {
  group: TPromptGroup;
  instanceProjectId?: string;
}) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { submitPrompt } = useSubmitMessage();
  const [isPreviewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [isVariableDialogOpen, setVariableDialogOpen] = useState(false);

  const groupIsGlobal = useMemo(
    () => instanceProjectId != null && group.projectIds?.includes(instanceProjectId),
    [group, instanceProjectId],
  );

  // Check permissions for the promptGroup
  const { hasPermission } = useResourcePermissions(ResourceType.PROMPTGROUP, group._id || '');
  const canEdit = hasPermission(PermissionBits.EDIT);

  const previewButtonRef = useRef<HTMLButtonElement | null>(null);

  const onCardClick: React.MouseEventHandler<HTMLButtonElement> = () => {
    const text = group.productionPrompt?.prompt;
    if (!text?.trim()) {
      return;
    }

    if (detectVariables(text)) {
      setVariableDialogOpen(true);
      return;
    }

    submitPrompt(text);
  };

  return (
    <>
      <div className="my-2 rounded-xl border border-border-light bg-transparent px-1 hover:bg-surface-secondary">
        <ListCard
          name={group.name}
          category={group.category ?? ''}
          onClick={onCardClick}
          snippet={
            typeof group.oneliner === 'string' && group.oneliner.length > 0
              ? group.oneliner
              : (group.productionPrompt?.prompt ?? '')
          }
          icon={
            groupIsGlobal ? (
              <EarthIcon
                className="icon-md shrink-0 text-green-400"
                aria-label={localize('com_ui_sr_global_prompt')}
              />
            ) : undefined
          }
        >
          <div className="flex items-center gap-1">
            <TooltipAnchor
              description={localize('com_ui_preview')}
              side="top"
              render={
                <Button
                  ref={previewButtonRef}
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label={localize('com_ui_preview')}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPreviewDialogOpen(true);
                  }}
                >
                  <Eye className="size-4 text-text-primary" aria-hidden="true" />
                </Button>
              }
            />
            {canEdit && (
              <TooltipAnchor
                description={localize('com_ui_edit')}
                side="top"
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={localize('com_ui_edit')}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/d/prompts/${group._id}`);
                    }}
                  >
                    <Pencil className="size-4 text-text-primary" aria-hidden="true" />
                  </Button>
                }
              />
            )}
          </div>
        </ListCard>
      </div>
      <PreviewPrompt
        group={group}
        open={isPreviewDialogOpen}
        onOpenChange={setPreviewDialogOpen}
        onCloseAutoFocus={() => {
          requestAnimationFrame(() => {
            previewButtonRef.current?.focus({ preventScroll: true });
          });
        }}
      />
      <VariableDialog
        open={isVariableDialogOpen}
        onClose={() => setVariableDialogOpen(false)}
        group={group}
      />
    </>
  );
}

export default memo(ChatGroupItem);
