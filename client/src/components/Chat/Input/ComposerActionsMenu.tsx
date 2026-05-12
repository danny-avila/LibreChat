import React, { useRef, useState, useMemo, useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import * as Ariakit from '@ariakit/react';
import { Plus, Paperclip } from 'lucide-react';
import {
  FileUpload,
  TooltipAnchor,
  DropdownPopup,
  SharePointIcon,
} from '@librechat/client';
import {
  Tools,
  EToolResources,
  EModelEndpoint,
  isPermissiveMimeConfig,
  bedrockDocumentExtensions,
} from 'librechat-data-provider';
import type { EndpointFileConfig, TConversation } from 'librechat-data-provider';
import type { MenuItemProps, ExtendedFile, FileSetter } from '~/common';
import {
  useAgentToolPermissions,
  useFileHandlingNoChatContext,
  useLocalize,
} from '~/hooks';
import { useSharePointFileHandlingNoChatContext } from '~/hooks/Files/useSharePointFileHandling';
import { SharePointPickerDialog } from '~/components/SharePoint';
import { useGetStartupConfig } from '~/data-provider';
import { ephemeralAgentByConvoId } from '~/store';
import { cn } from '~/utils';

type FileUploadType =
  | 'image'
  | 'document'
  | 'image_document'
  | 'image_document_extended'
  | 'image_document_video_audio';

interface ComposerActionsMenuProps {
  agentId?: string | null;
  endpoint?: string | null;
  disabled?: boolean | null;
  conversationId: string;
  endpointType?: EModelEndpoint | string;
  endpointFileConfig?: EndpointFileConfig;
  useResponsesApi?: boolean;
  files: Map<string, ExtendedFile>;
  setFiles: FileSetter;
  setFilesLoading: React.Dispatch<React.SetStateAction<boolean>>;
  conversation: TConversation | null;
}

const ComposerActionsMenu = ({
  agentId,
  disabled,
  conversationId,
  endpointFileConfig,
  files,
  setFiles,
  setFilesLoading,
  conversation,
}: ComposerActionsMenuProps) => {
  const localize = useLocalize();
  const isDisabled = disabled ?? false;
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPopoverActive, setIsPopoverActive] = useState(false);
  const ephemeralAgent = useRecoilValue(ephemeralAgentByConvoId(conversationId));
  const [toolResource, setToolResource] = useState<EToolResources | undefined>();
  const [isSharePointDialogOpen, setIsSharePointDialogOpen] = useState(false);

  const { handleFileChange } = useFileHandlingNoChatContext(undefined, {
    files,
    setFiles,
    setFilesLoading,
    conversation,
  });
  const { handleSharePointFiles, isProcessing, downloadProgress } =
    useSharePointFileHandlingNoChatContext(
      { toolResource },
      { files, setFiles, setFilesLoading, conversation },
    );

  const { data: startupConfig } = useGetStartupConfig();
  const sharePointEnabled = startupConfig?.sharePointFilePickerEnabled;

  const { fileSearchAllowedByAgent, codeAllowedByAgent } = useAgentToolPermissions(
    agentId,
    ephemeralAgent,
  );

  const handleUploadClick = useCallback(
    (fileType?: FileUploadType) => {
      if (!inputRef.current) {
        return;
      }
      inputRef.current.value = '';
      if (
        fileType !== undefined &&
        isPermissiveMimeConfig(endpointFileConfig?.supportedMimeTypes)
      ) {
        inputRef.current.accept = '';
      } else if (fileType === 'image') {
        inputRef.current.accept = 'image/*,.heif,.heic';
      } else if (fileType === 'document') {
        inputRef.current.accept = '.pdf,application/pdf';
      } else if (fileType === 'image_document') {
        inputRef.current.accept = 'image/*,.heif,.heic,.pdf,application/pdf';
      } else if (fileType === 'image_document_extended') {
        inputRef.current.accept = `image/*,.heif,.heic,${bedrockDocumentExtensions}`;
      } else if (fileType === 'image_document_video_audio') {
        inputRef.current.accept = 'image/*,.heif,.heic,.pdf,application/pdf,video/*,audio/*';
      } else {
        inputRef.current.accept = '';
      }
      inputRef.current.click();
      inputRef.current.accept = '';
    },
    [endpointFileConfig?.supportedMimeTypes],
  );

  /**
   * Routage auto à l'ouverture du sélecteur de fichier, basé sur l'état
   * des badges horizontaux (single source of truth pour l'activation
   * des outils) :
   *   1. file_search ON  → indexation RAG (priorité haute)
   *   2. execute_code ON → interpréteur de code
   *   3. sinon           → upload binaire multimodal au LLM
   *
   * Correction #1 : `onAction()` est appelé sans `fileType` dans les 3
   * branches → l'input `accept` reste vide → tous formats (xlsx, pptx,
   * docx, …) sélectionnables. Le routage côté serveur est piloté
   * uniquement par `toolResource`.
   */
  const triggerFileSelection = useCallback(
    (onAction: (fileType?: FileUploadType) => void) => {
      const fileSearchOn =
        ephemeralAgent?.[Tools.file_search] === true && fileSearchAllowedByAgent;
      const codeOn =
        ephemeralAgent?.[Tools.execute_code] === true && codeAllowedByAgent;

      if (fileSearchOn) {
        setToolResource(EToolResources.file_search);
      } else if (codeOn) {
        setToolResource(EToolResources.execute_code);
      } else {
        setToolResource(undefined);
      }
      onAction();
    },
    [ephemeralAgent, fileSearchAllowedByAgent, codeAllowedByAgent],
  );

  const fileItems = useMemo<MenuItemProps[]>(() => {
    const items: MenuItemProps[] = [];
    items.push({
      label: localize('com_ui_composer_attach_file'),
      icon: <Paperclip className="icon-md" />,
      onClick: () => triggerFileSelection(handleUploadClick),
    });
    if (sharePointEnabled) {
      items.push({
        label: localize('com_files_upload_sharepoint'),
        onClick: () => {},
        icon: <SharePointIcon className="icon-md" />,
        subItems: [
          {
            label: localize('com_ui_composer_attach_file'),
            icon: <Paperclip className="icon-md" />,
            onClick: () =>
              triggerFileSelection(() => {
                setIsSharePointDialogOpen(true);
              }),
          },
        ],
      });
    }
    return items;
  }, [localize, sharePointEnabled, triggerFileSelection, handleUploadClick]);

  const menuTrigger = (
    <TooltipAnchor
      render={
        <Ariakit.MenuButton
          disabled={isDisabled}
          id="composer-actions-menu-button"
          aria-label={localize('com_ui_composer_actions')}
          className={cn(
            'flex size-9 items-center justify-center rounded-full p-1 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-opacity-50',
            isPopoverActive && 'bg-surface-hover',
          )}
        >
          <Plus className="size-5" aria-hidden="true" />
        </Ariakit.MenuButton>
      }
      id="composer-actions-menu-button"
      description={localize('com_ui_composer_actions')}
      disabled={isDisabled}
    />
  );

  const handleSharePointFilesSelected = async (sharePointFiles: any[]) => {
    try {
      await handleSharePointFiles(sharePointFiles);
      setIsSharePointDialogOpen(false);
    } catch (error) {
      console.error('SharePoint file processing error:', error);
    }
  };

  if (fileItems.length === 0) {
    return null;
  }

  /**
   * Routage MIME au moment de la sélection. Priorité :
   *   1. Badge actif (file_search / execute_code) → `toolResource` posé
   *      par `triggerFileSelection`, on respecte
   *   2. Sinon, fichier image/* ou application/pdf → multimodal natif
   *      (toolResource reste undefined)
   *   3. Sinon (xlsx, docx, pptx, csv, txt, md, json…) → extraction
   *      texte serveur via EToolResources.context. Le LLM reçoit le
   *      contenu textuel injecté en contexte du prompt.
   * En multi-fichiers, MIME du premier fichier (V1).
   */
  const resolveFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      let resolvedResource = toolResource;
      const files = e.target.files;
      if (resolvedResource === undefined && files && files.length > 0) {
        const firstMime = files[0].type ?? '';
        const isImage = firstMime.startsWith('image/');
        const isPdf = firstMime === 'application/pdf';
        if (!isImage && !isPdf) {
          resolvedResource = EToolResources.context;
        }
      }
      handleFileChange(e, resolvedResource);
    },
    [toolResource, handleFileChange],
  );

  return (
    <>
      <FileUpload ref={inputRef} handleFileChange={resolveFileChange}>
        <DropdownPopup
          menuId="composer-actions-menu"
          isOpen={isPopoverActive}
          setIsOpen={setIsPopoverActive}
          modal={true}
          unmountOnHide={true}
          trigger={menuTrigger}
          items={fileItems}
          itemClassName="flex w-full cursor-pointer rounded-lg items-center justify-between hover:bg-surface-hover gap-5"
          iconClassName="mr-0"
        />
      </FileUpload>
      <SharePointPickerDialog
        isOpen={isSharePointDialogOpen}
        onOpenChange={setIsSharePointDialogOpen}
        onFilesSelected={handleSharePointFilesSelected}
        isDownloading={isProcessing}
        downloadProgress={downloadProgress}
        maxSelectionCount={endpointFileConfig?.fileLimit}
      />
    </>
  );
};

export default React.memo(ComposerActionsMenu);
