import debounce from 'lodash/debounce';
import React, { memo, useMemo, useCallback, useRef, useEffect } from 'react';
import { useRecoilState, useSetRecoilState } from 'recoil';
import { TerminalSquareIcon } from 'lucide-react';
import {
  Tools,
  AuthType,
  Constants,
  LocalStorageKeys,
  PermissionTypes,
  Permissions,
  button,
  TMessage,
  QueryKeys,
} from 'librechat-data-provider';
import ApiKeyDialog from '~/components/SidePanel/Agents/Code/ApiKeyDialog';
import {
  useLocalize,
  useHasAccess,
  useCodeApiKeyForm,
  useGenFilesForm,
  useStudentHelpForm,
} from '~/hooks';
import CheckboxButton from '~/components/ui/CheckboxButton';
import useLocalStorage from '~/hooks/useLocalStorageAlt';
import { useVerifyAgentToolAuth, useUpdateConversationMutation } from '~/data-provider';
import { ephemeralAgentByConvoId } from '~/store';
import { Button } from '~/components/ui';
import { UserPlus, UsersRound } from 'lucide-react';
import StudentHelpDialog from '../StudentHelp/StudentHelpDialog';
import { on } from 'events';
import { StudentHelpFormData } from '~/hooks/Plugins/useStudentHelpForm';
import ConversationNameDialog from '../ConversationName/ConversationNameDialog';
import { useForm, FormProvider } from 'react-hook-form';
import { useModelSelectorContext } from '../Menus/Endpoints/ModelSelectorContext';
import { modeState, Mode } from '~/store/mode';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import store from '~/store';
import { useSubmitMessage } from '~/hooks';
import useWarmupSkillsContainer from '~/hooks/Anthropic/useWarmupSkillsContainer';
import Conversation from '~/components/Conversations/Convo';
import useConversationNameForm from '~/hooks/Plugins/useConversationNameForm';
import useChatFunctions from '~/hooks/Chat/useChatFunctions';
import { NotificationSeverity } from '~/common';
import { useChatContext } from '~/Providers';


// const storageCondition = (value: unknown, rawCurrentValue?: string | null) => {
//   if (rawCurrentValue) {
//     try {
//       const currentValue = rawCurrentValue?.trim() ?? '';
//       if (currentValue === 'true' && value === false) {
//         return true;
//       }
//     } catch (e) {
//       console.error(e);
//     }
//   }
//   return value !== undefined && value !== null && value !== '' && value !== false;
// };

const label = 'Help Others';
const description = 'Get guidance on helping students using therapeutic excertises and classroom management techniques';

function StudentDetailsFormButton({
  conversationId,
  className,
  mode,
  convoCleanup,
  descriptionClassName,
  buttonClassName,
  index = 0,
}: {
  conversationId?: string | null;
  className?: string;
  convoCleanup?: () => void;
  mode: Mode;
  index?: number;
  props?: {
    label?: string;
    description?: string;
    descriptionClassName?: string;
    buttonClassName?: string;
  };
}) {
  const triggerRef = useRef<HTMLInputElement>(null);
  const setMode = useSetRecoilState(modeState);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const warmupSkillsContainer = useWarmupSkillsContainer();
  // const { conversation } = store.useCreateConversationAtom(index);
  const { conversation, newConversation } = useChatContext();
  const [currentMode] = useRecoilState(modeState);
  const { submitMessage, submitPrompt } = useSubmitMessage();
  const { mutateAsync: renameConversation } = useUpdateConversationMutation(
    conversation?.conversationId ?? '',
  );

  const updateConvoMutation = useUpdateConversationMutation(conversation?.conversationId ?? '');

  const pendingTitleRef = useRef<string | null>(null);

  const { methods, onSubmit, isDialogOpen, setIsDialogOpen } = useConversationNameForm({
    mode,
    onSubmit: (form) => {
      const spec = findSpecByName(modelSpecs, 'TEST-help-others');

      console.log(spec);
      if (!spec) return;


      pendingTitleRef.current = form.studentName.trim() || 'Untitled';
      console.log(form);

      const title = form.studentName.trim() || 'New Chat Default 223';

      sessionStorage.setItem('pendingTitle', title);

      // navigate('/c/new', { state: { focusChat: true, initialTitle: title } });

      newConversation({ template: { title } });

      console.log('Conversation Name submitted');
      console.log(conversation?.conversationId);

      // submitPrompt({ text: 'First Message' });
      console.log(conversation?.conversationId);
      setIsDialogOpen(false);

      handleSelectSpec(spec);
      // sendMessage('First Message').then(() => {
      // console.log('First Message sent');

      // performRenameConversation(
      //   pendingTitleRef.current ?? '',
      //   conversation?.conversationId ?? Constants.NEW_CONVO,
      // );
      // });
    },
  });

  const {
    // LibreChat
    modelSpecs,
    mappedEndpoints,
    endpointsConfig,
    // State
    searchValue,
    searchResults,
    selectedValues,

    // Functions
    setSearchValue,
    setSelectedValues,
    // Dialog
    keyDialogOpen,
    keyDialogEndpoint,
    handleSelectSpec,
  } = useModelSelectorContext();

  const findSpecByName = <T extends { name: string }>(specs: T[], target: string): T | undefined =>
    specs.find((s) => s.name === target);

  const sendMessage = async (message: string) => {
    submitMessage({ text: 'First Message' });
  };

  const handleSubmit = () => {
    const spec = findSpecByName(modelSpecs, 'help-others');
    if (!spec) return;

    /* Kick off Skills container pre-warm in the background. By the time the
     * user types their first message, the container should be ready. */
    warmupSkillsContainer();

    setMode(mode);
    queryClient.setQueryData<TMessage[]>(
      [QueryKeys.messages, conversation?.conversationId ?? Constants.NEW_CONVO],
      [],
    );
    queryClient.invalidateQueries({ queryKey: [QueryKeys.messages] });
    // navigate('/c/new', { state: { focusChat: true } });
    newConversation();

    console.log('Student Button Pressed');
    setIsDialogOpen(!isDialogOpen);
    handleSelectSpec(spec);
  };

  // const handleChange = useCallback(
  //   (e: React.ChangeEvent<HTMLInputElement>, isChecked: boolean) => {
  //     console.log('called handleChange');
  //     setIsDialogOpen(true);
  //     e.preventDefault();
  //     return;
  //   },
  //   [setIsDialogOpen],
  // );

  const handleChange = () => {
    console.log('Opening Student Help Dialog');
    const spec = findSpecByName(modelSpecs, 'help-others');
    if (!spec) return;
    console.log('setting mode to:', mode);
    /* Pre-warm the Skills container in the background. */
    warmupSkillsContainer();
    setMode(mode);

    queryClient.setQueryData<TMessage[]>(
      [QueryKeys.messages, conversation?.conversationId ?? Constants.NEW_CONVO],
      [],
    );
    queryClient.invalidateQueries({ queryKey: [QueryKeys.messages] });
    navigate('/c/new', { state: { focusChat: true } });

    handleSelectSpec(spec);
  };

  const performRenameConversation = async (newTitle: string, conversationId: string) => {
    try {
      await updateConvoMutation.mutateAsync({
        conversationId,
        title: newTitle.trim() || localize('com_ui_untitled'),
      });
    } catch (error) {
      showToast({
        message: localize('com_ui_rename_failed'),
        severity: NotificationSeverity.ERROR,
        showIcon: true,
      });
    }
  };

  const openDialog = useCallback(() => {
    console.log('Opening Student Help Dialog');
    // const spec = findSpecByName(modelSpecs, 'help-myself');
    // if (!spec) return;
    // console.log('setting mode to:', mode);
    // setMode(mode);


    // queryClient.setQueryData<TMessage[]>(
    //   [QueryKeys.messages, conversation?.conversationId ?? Constants.NEW_CONVO],
    //   [],
    // );
    // queryClient.invalidateQueries({ queryKey: [QueryKeys.messages] });
    // navigate('/c/new', { state: { focusChat: true } });

    // handleSelectSpec(spec);

    setIsDialogOpen(true);
  }, [setIsDialogOpen]);

  // useEffect(() => {
  //   const wantedTitle = pendingTitleRef.current;
  //   const convoId = conversation?.conversationId;

  //   if (wantedTitle && convoId && convoId !== Constants.NEW_CONVO) {
  //     renameConversation({ conversationId: convoId, title: wantedTitle })
  //       .then(() => {
  //         /* refresh sidebar cache so new title shows immediately */
  //         queryClient.setQueryData(['conversations'], (prev: any[] | undefined) =>
  //           prev?.map((c) => (c.conversationId === convoId ? { ...c, title: wantedTitle } : c)),
  //         );
  //       })
  //       .catch(console.error)
  //       .finally(() => {
  //         pendingTitleRef.current = null; // run once only
  //       });
  //   }
  // }, [conversation?.conversationId, renameConversation, queryClient]);

  // useEffect(() => {
  //   const wantedTitle = pendingTitleRef.current;
  //   const convoId = conversation?.conversationId;

  //   console.log('renaming convo in useeffect');
  //   console.log('wantedTitle:', wantedTitle);
  //   console.log('convoId:', convoId);
  //   if (wantedTitle && convoId && convoId !== Constants.NEW_CONVO) {
  //     renameConversation({ conversationId: convoId, title: wantedTitle })
  //       .then(() => {
  //         /* refresh sidebar cache so new title shows immediately */
  //         queryClient.setQueryData(['conversations'], (prev: any[] | undefined) =>
  //           prev?.map((c) => (c.conversationId === convoId ? { ...c, title: wantedTitle } : c)),
  //         );
  //       })
  //       .catch(console.error)
  //       .finally(() => {
  //         pendingTitleRef.current = null; // run once only
  //       });
  //   }
  //   /* 🔑 add renameConversation so effect re-fires with the fresh mutate fn */
  // }, [conversation?.conversationId, renameConversation, queryClient]);

  return (
    <>
      <Button
        variant={currentMode === 'student' ? 'outline' : 'secondary'}
        onClick={handleChange}
        aria-label="Open student help dialog"
        className={`flex w-full items-center justify-start gap-3 rounded-lg py-3 pl-[15%] pr-[30%] text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring ${className ?? ''} ${buttonClassName || ''}`}
      >
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center">
          <UsersRound className="h-5 w-5" color="#c28770" />
        </span>
        <div className="ml-4 flex flex-col leading-snug">
          <span className="text-sm font-medium">{label}</span>
          <span className={`text-xs text-muted-foreground ${descriptionClassName || ''}`}>
            {description}
          </span>
        </div>
      </Button>
      <FormProvider {...methods}>
        <ConversationNameDialog
          // onSubmit={handleSubmit}
          onSubmit={methods.handleSubmit(onSubmit)}
          isOpen={isDialogOpen}
          triggerRef={triggerRef}
          register={methods.register}
          // onRevoke={handleRevokeApiKey}
          onOpenChange={setIsDialogOpen}
          handleSubmit={methods.handleSubmit}
        // isToolAuthenticated={isAuthenticated}
        />
      </FormProvider>
    </>
  );
}

export default memo(StudentDetailsFormButton);

function then(arg0: () => void) {
  throw new Error('Function not implemented.');
}

function localize(arg0: string): string {
  throw new Error('Function not implemented.');
}

function showToast(arg0: { message: string; severity: any; showIcon: boolean; }) {
  throw new Error('Function not implemented.');
}
// function setMode(mode: any) {
//   throw new Error('Function not implemented.');
// }