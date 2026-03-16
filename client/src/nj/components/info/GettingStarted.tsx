/* eslint-disable i18next/no-literal-string */
/* ^ We're not worried about i18n for this app ^ */

import FaqSection, { FAQ } from '~/nj/components/info/FaqSection';

const gettingStartedFAQs: FAQ[] = [
  {
    question: "What's new in this version?",
    answer: (
      <>
        <p className="mb-3">
          The updated NJ AI Assistant brings a redesigned interface and expanded capabilities based
          on feedback from users like you. Along with previous functionality from version 1.0, this
          new update brings:
        </p>
        <ul className="mb-6 list-outside list-disc pl-8">
          <li className="mb-2">
            <strong>Smarter responses</strong> — Powered by an upgraded AI model with knowledge
            through October 2025
          </li>
          <li className="mb-2">
            <strong>Chat history</strong> — See past chats, and continue chats of a particular topic
            in the same conversation thread
          </li>
          <li className="mb-2">
            <strong>Visible reasoning</strong> —{' '}
            {`Responses now include a "thoughts" section that
            shows the assistant's reasoning. Reviewing this can help you catch errors, verify logic,
            and decide whether the output is ready to use.`}
          </li>
          <li className="mb-2">
            <strong>More control over your conversations</strong> — Voice transcription, edit
            prompts, retry responses, and revisit past chats
          </li>
          <li className="mb-2">
            <strong>Built-in learning resources</strong> — Guides on effective prompting and
            responsible AI use, plus direct access to State AI policy
          </li>
        </ul>
      </>
    ),
  },
  {
    question: 'How do I navigate the NJ AI Assistant?',
    answer: (
      <>
        <p className="mb-3">{`We've added a few ways to move around and find what you need.`}</p>
        <ul className="mb-6 list-outside list-disc pl-8">
          <li className="mb-2">
            <strong>Sidebar</strong> — A collapsible menu on the left side of your screen gives you
            access to your recent chats and learning resources. Look for the user menu at the bottom
            to explore guides, learn about the tool, or get in contact with us.
          </li>
          <li className="mb-2">
            <strong>Starting a new chat</strong> — You have options: type directly into the chat
            window, click the new chat button in the top right, or click the NJ AI Assistant logo.
          </li>
        </ul>
      </>
    ),
  },
];

export default function GettingStarted() {
  return <FaqSection title={'Getting Started'} faqs={gettingStartedFAQs} />;
}
