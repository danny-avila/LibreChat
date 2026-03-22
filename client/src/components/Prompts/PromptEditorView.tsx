import { useParams } from 'react-router-dom';
import { PromptGroupsProvider } from '~/Providers';
import CreatePromptForm from './Groups/CreatePromptForm';
import PromptForm from './PromptForm';
import Footer from '~/components/Chat/Footer';

function PromptEditorView() {
  const { promptId } = useParams();
  const isNew = promptId === undefined;

  return (
    <PromptGroupsProvider>
      <div
        className="relative flex h-full w-full flex-col overflow-hidden bg-presentation"
        data-testid="prompt-editor-view"
      >
        <main className="flex flex-1 flex-col overflow-y-auto" role="main">
          <div className="mx-auto w-full max-w-5xl flex-1 px-2 py-4 sm:px-4 md:px-6">
            {isNew ? <CreatePromptForm /> : <PromptForm />}
          </div>
        </main>
        <Footer />
      </div>
    </PromptGroupsProvider>
  );
}

export default PromptEditorView;
