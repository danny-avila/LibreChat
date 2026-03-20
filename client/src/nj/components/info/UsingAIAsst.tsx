/* eslint-disable i18next/no-literal-string */
/* ^ We're not worried about i18n for this app ^ */

import FaqSection, { FAQSectionProps } from '~/nj/components/info/FaqSection';

const usingAIFAQs = [
  {
    question: 'How can I use the NJ AI Assistant?',
    answer: (
      <>
        <p className="mb-3">
          The NJ AI Assistant is a conversational tool that works with language. At its core, it
          reads and generates text—which means it can help you write, refine, analyze, and
          reorganize information through back-and-forth conversation.
        </p>
        <p className="mb-3">
          You can think of it as having a thinking partner or collaborator. You provide it with
          instructions about what you need, and it responds with new text. This makes it very useful
          for things like:
        </p>
        <ul className="mb-3 list-outside list-disc pl-8">
          <li className="mb-2">Drafting and editing content</li>
          <li className="mb-2">Summarizing and synthesizing content</li>
          <li className="mb-2">Analyzing and extracting information from documents</li>
          <li className="mb-2">
            Generating ideas and exploring different angles for a given problem
          </li>
        </ul>
        <p className="mb-3">
          In addition, many agencies are independently - or in collaboration with NJIA staff -
          finding advanced use cases for the NJ AI Assistant. Feel free to contact us if you have
          ideas or questions.
        </p>
      </>
    ),
  },
  {
    question: 'What can’t I use the NJ AI Assistant for?',
    answer: (
      <>
        {' '}
        <p className="mb-3"></p>
        <p className="mb-3">
          Although the NJ AI Assistant works by generating language, there are still some things it
          is not well-suited for:
        </p>
        <ul className="mb-6 list-outside list-disc pl-8">
          <li className="mb-2">
            <strong>Precise calculations and statistics:</strong> The NJ AI Assistant can’t do
            mathematical calculations in the way a spreadsheet can. Instead, use it to organize
            qualitative information, like survey responses, into themes. Text-based AI Assistants
            are heavily prone to errors when dealing with quantitative data. Always verify numbers
            independently.
          </li>
          <li className="mb-2">
            <span className="font-bold">Executing code:</span> If you&#39;re using the AI Assistant
            for coding tasks, keep in mind that it can generate code but{' '}
            <span className="font-bold">cannot execute it</span>. Occasionally, it may simulate what
            running the code would look like—these outputs are fabricated and should be ignored. To
            avoid this, be explicit in your prompt that you only want the code, not example results.
          </li>
          <li className="mb-2">
            <strong>Analysis without source material:</strong> The NJ AI Assistant doesn’t have
            access to external databases, state systems, or real-time information. A broad question
            like “What areas of NJ are the most likely to be impacted by extreme weather?” won’t get
            a reliable answer on its own. Instead, give it something to work with: upload relevant
            reports, provide context, be specific about how you’d like it to approach its analysis,
            and ask it to show its reasoning so you can spot errors.
          </li>
        </ul>
      </>
    ),
  },
  {
    question: 'What file types can I upload?',
    answer: (
      <>
        <p className="mb-3">The following file types are supported:</p>
        <ul className="mb-6 list-outside list-disc pl-8">
          <li className="mb-2">Files: pdf, csv, xls/xlsx, docx, .txt, .md</li>
          <li className="mb-2">Code types: python, java, js, (and others)</li>
          <li className="mb-2">Images file types: jpeg, jpg, png, gif, webp, heic, heif</li>
          <li className="mb-2">
            Maximum number of files: 10 files per prompt (whether images or text)
          </li>
          <li className="mb-2">
            Maximum file size: 50 MB max per each file, and a total maximum size of 60 MB for all
            files uploaded per prompt
          </li>
        </ul>
      </>
    ),
  },
  {
    question:
      'Can I enter personally identifiable information and sensitive information into the NJ AI Assistant?',
    answer: (
      <>
        <p className="mb-6">
          Employees are allowed to enter personally identifiable information (PII) and other
          sensitive information into state-approved tools (including the NJ AI Assistant), but
          please see the{' '}
          <a
            href="https://innovation.nj.gov/ai-faq-state-employees/"
            className="underline hover:decoration-2"
            target="_blank"
            rel="noreferrer"
          >
            official FAQ
          </a>{' '}
          for guidance before doing so. The{' '}
          <a
            href="https://nj.gov/it/docs/ps/25-OIT-001-State-of-New-Jersey-Guidance-on-Responsible-Use-of-Generative-AI.pdf"
            className="underline hover:decoration-2"
            target="_blank"
            rel="noreferrer"
          >
            State’s current policy on responsible use of AI technology
          </a>{' '}
          also covers this topic in detail.
        </p>
      </>
    ),
  },
  {
    question: 'Who can see the prompts I share?',
    answer: (
      <>
        <p className="mb-3">
          The data for the NJ AI Assistant is stored in a state-hosted database. Your prompts and
          responses are encrypted, and none of this information will be used as training data for AI
          models, due to the government-friendly terms of service we have with our service
          providers.
        </p>
        <p className="mb-3">
          Chat history, similar to other state work-related documents, is retained in accordance
          with state records retention policies and may be subject to the open records request
          (OPRA). Consult with your agency’s records custodians for more information.
        </p>
        <p className="mb-3">
          For maintenance purposes, the Platform team and OIT can access the information stored in
          the database, and would only access this information in response to a user request to help
          with a technical issue or if legally required.
        </p>
      </>
    ),
  },
  {
    question: 'What is the context limit, token limit, and temperature of the NJ AI Assistant?',
    answer: (
      <ul className="mb-6 list-outside list-disc pl-8">
        <li className="mb-2">The context limit: 1,000,000 tokens</li>
        <li className="mb-2">Output token limit: 64,000 tokens</li>
        <li className="mb-2">Temperature: 1.0</li>
      </ul>
    ),
    wrappedQuestionMargin: 'mb-3',
  },
];

export default function UsingAIAsst({
  openFaq,
  setOpenFaq,
}: Pick<FAQSectionProps, 'openFaq' | 'setOpenFaq'>) {
  return (
    <FaqSection
      title="Using the NJ AI Assistant"
      faqs={usingAIFAQs}
      openFaq={openFaq}
      setOpenFaq={setOpenFaq}
    />
  );
}
