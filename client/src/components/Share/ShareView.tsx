import { memo } from 'react';
import { useParams } from 'react-router-dom';
import { useGetSharedMessages } from 'librechat-data-provider/react-query';
import { ShareContext } from '~/Providers';
import { Spinner } from '~/components/svg';
import MessagesView from './MessagesView';
import { useLocalize } from '~/hooks';
import { buildTree } from '~/utils';
import Footer from '../Chat/Footer';

function SharedView() {
  const localize = useLocalize();
  const { shareId } = useParams();
  const { data, isLoading } = useGetSharedMessages(shareId ?? '');
  const dataTree = data && buildTree({ messages: data.messages });
  const messagesTree = dataTree?.length === 0 ? null : dataTree ?? null;

  return (
    <ShareContext.Provider value={{ isSharedConvo: true }}>
      <div
        className="relative flex w-full grow overflow-hidden bg-white dark:bg-gray-800"
        style={{ paddingBottom: '50px' }}
      >
        <div className="transition-width relative flex h-full w-full flex-1 flex-col items-stretch overflow-hidden bg-white pt-0 dark:bg-gray-800">
          <div className="flex h-full flex-col" role="presentation" tabIndex={0}>
            {isLoading ? (
              <div className="flex h-screen items-center justify-center">
                <Spinner className="" />
              </div>
            ) : data && messagesTree && messagesTree.length !== 0 ? (
              <>
                <div className="final-completion group mx-auto flex min-w-[40rem] flex-col gap-3 pb-6 pt-4 md:max-w-3xl md:px-5 lg:max-w-[40rem] lg:px-1 xl:max-w-[48rem] xl:px-5">
                  <h1 className="text-4xl font-bold dark:text-white">{data.title}</h1>
                  <div className="border-b pb-6 text-base text-gray-300">
                    {new Date(data.createdAt).toLocaleDateString('en-US', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </div>
                </div>

                <MessagesView messagesTree={messagesTree} conversationId={data.conversationId} />
              </>
            ) : (
              <div className="flex h-screen items-center justify-center">
                {localize('com_ui_shared_link_not_found')}
              </div>
            )}
            <div className="w-full border-t-0 pl-0 pt-2 dark:border-white/20 md:w-[calc(100%-.5rem)] md:border-t-0 md:border-transparent md:pl-0 md:pt-0 md:dark:border-transparent">
              <Footer className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-center gap-2 bg-gradient-to-t from-gray-50 to-transparent px-2 pb-2 pt-8 text-xs text-gray-600 dark:from-gray-800 dark:text-gray-300 md:px-[60px]" />
            </div>
          </div>
        </div>
      </div>
    </ShareContext.Provider>
  );
}

export default memo(SharedView);
