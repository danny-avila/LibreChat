import { render } from 'test/layout-test-utils';
import HoverButtons from '~/components/Chat/Messages/HoverButtons';
import store from '~/store';
import { RecoilRoot } from 'recoil';
import { screen } from '@testing-library/dom';

describe('HoverButtons NJ customizations', () => {
  test('Disabled fork & feedback buttons', () => {
    const dom = render(
      <RecoilRoot
        // Disable TTS (it's not needed for the test & complicates setup)
        initializeState={({ set }) => set(store.textToSpeech, false)}
        override={true}
      >
        <HoverButtons
          index={0}
          isEditing={false}
          enterEdit={() => {}}
          copyToClipboard={() => {}}
          // @ts-ignore - we only need a snippet of this complex object for the buttons
          conversation={{
            conversationId: 'abcdefg',
          }}
          isSubmitting={false}
          // @ts-ignore - we only need a snippet of this complex object for the buttons
          message={{
            isCreatedByUser: false,
            messageId: 'hijklmnop',
          }}
          regenerate={() => {}}
          handleContinue={() => {}}
          latestMessage={null}
          isLast={true}
          handleFeedback={() => {}}
        />
      </RecoilRoot>,
    );

    // Expect hidden buttons NOT to be in the hover buttons
    const forkButton = dom.container.querySelector('[aria-label="Fork"]');
    expect(forkButton).not.toBeInTheDocument();

    const thumbsUpButton = screen.queryByTitle('Love this');
    expect(thumbsUpButton).not.toBeInTheDocument();

    const thumbsDownButton = screen.queryByTitle('Needs improvement');
    expect(thumbsDownButton).not.toBeInTheDocument();

    // Assert that buttons are rendering *at all* (otherwise test might be buggy)
    const copyButton = screen.queryByTitle('Copy to clipboard');
    expect(copyButton).toBeInTheDocument();
  });
});
