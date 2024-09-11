import { memo, useEffect } from 'react';
import { useRecoilState } from 'recoil';
import { useParams } from 'react-router-dom';
import { useGetSharedMessages, useGetStartupConfig } from 'librechat-data-provider/react-query';
import SharedArtifactButton from './SharedArtifactButton';
import { useLocalize, useDocumentTitle } from '~/hooks';
import SharedArtifacts from './SharedArtifacts';
import { ShareContext } from '~/Providers';
import { Spinner } from '~/components/svg';
import MessagesView from './MessagesView';
import { buildTree } from '~/utils';
import Footer from '../Chat/Footer';
import { cn } from '~/utils';
import store from '~/store';

function SharedView() {
  const localize = useLocalize();
  const { data: config } = useGetStartupConfig();
  const { shareId } = useParams();
  const { data, isLoading } = useGetSharedMessages(shareId ?? '');
  const dataTree = data && buildTree({ messages: data.messages });
  const messagesTree = dataTree?.length === 0 ? null : dataTree ?? null;
  const [isArtifactPanelOpen, setIsArtifactPanelOpen] = useRecoilState(store.artifactsVisible);
  const [codeArtifacts, setCodeArtifacts] = useRecoilState<boolean>(store.codeArtifacts);

  // configure document title
  let docTitle = '';
  if (config?.appTitle != null && data?.title != null) {
    docTitle = `${data.title} | ${config.appTitle}`;
  } else {
    docTitle = data?.title ?? config?.appTitle ?? document.title;
  }

  useDocumentTitle(docTitle);

  useEffect(() => {
    // Ensure artifact panel is initially closed
    setIsArtifactPanelOpen(false);

    // Store the initial codeArtifacts value
    const initialCodeArtifacts = codeArtifacts;

    // Set codeArtifacts to true for shared link page
    setCodeArtifacts(true);

    // Reset artifact panel state and codeArtifacts when component unmounts
    return () => {
      setIsArtifactPanelOpen(false);
      setCodeArtifacts(initialCodeArtifacts);
    };
  }, [setIsArtifactPanelOpen, codeArtifacts, setCodeArtifacts]);

  let content: JSX.Element;
  if (isLoading) {
    content = (
      <div className="flex h-screen items-center justify-center">
        <Spinner className="" />
      </div>
    );
  } else if (data && messagesTree && messagesTree.length !== 0) {
    content = (
      <>
        <div className="final-completion group mx-auto flex min-w-[40rem] flex-col gap-3 pb-6 pt-4 md:max-w-3xl md:px-5 lg:max-w-[40rem] lg:px-1 xl:max-w-[48rem] xl:px-5">
          <h1 className="text-4xl font-bold">{data.title}</h1>
          <div className="border-b border-border-medium pb-6 text-base text-text-secondary">
            {new Date(data.createdAt).toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </div>
        </div>

        <MessagesView messagesTree={messagesTree} conversationId={data.conversationId} />
      </>
    );
  } else {
    content = (
      <div className="flex h-screen items-center justify-center ">
        {localize('com_ui_shared_link_not_found')}
      </div>
    );
  }

  return (
    <ShareContext.Provider value={{ isSharedConvo: true }}>
      <main
        className={cn(
          'relative flex w-full grow overflow-hidden dark:bg-surface-secondary transition-all duration-300 ease-in-out',
          isArtifactPanelOpen ? 'pr-[calc(50%-0.5rem)]' : ''
        )}
      >
        <div
          className={cn(
            'transition-all duration-300 ease-in-out',
            'relative flex h-full flex-1 flex-col items-stretch overflow-hidden pt-0 dark:bg-surface-secondary',
            isArtifactPanelOpen ? 'w-1/2 ml-2' : 'w-full'
          )}
        >
          <div className="flex h-full flex-col text-text-primary" role="presentation">
            {content}
            <div className={cn(
              'w-full border-t-0 pl-0 pt-2 md:w-[calc(100%-.5rem)] md:border-t-0 md:border-transparent md:pl-0 md:pt-0 md:dark:border-transparent',
              'transition-opacity duration-300 ease-in-out',
              isArtifactPanelOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'
            )}>
              <Footer className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-center gap-2 bg-gradient-to-t from-surface-secondary to-transparent px-2 pb-2 pt-8 text-xs text-text-secondary md:px-[60px]" />
            </div>
          </div>
        </div>
        <SharedArtifactButton onClick={() => setIsArtifactPanelOpen(true)} isOpen={isArtifactPanelOpen} />
        <SharedArtifacts isOpen={isArtifactPanelOpen} onClose={() => setIsArtifactPanelOpen(false)} />
      </main>
    </ShareContext.Provider>
  );
}

export default memo(SharedView);
