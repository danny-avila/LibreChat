/* eslint-disable i18next/no-literal-string */
/* ^ We're not worried about i18n for this app ^ */

import InfoDivider from '~/nj/components/info/InfoDivider';
import InfoTitle from '~/nj/components/info/InfoTitle';
import InfoSectionHeader from '~/nj/components/info/InfoSectionHeader';
import React from 'react';
import icons from '@uswds/uswds/img/sprite.svg';
import InfoLink from '~/nj/components/info/InfoLink';
import { useNavigate } from 'react-router-dom';

/**
 * Content for "guide to using the assistant" page
 */
export default function NewJerseyGuidePage() {
  const navigate = useNavigate();

  document.title = 'NJ AI Assistant - Guides and FAQs';

  return (
    <div>
      <InfoTitle text="Guides and FAQs" />

      <InfoDivider />

      <InfoSectionHeader text="Using the AI Assistant Responsibly" />
      <p className="mb-6">
        AI tools can generate responses that can sound confident but are incorrect or incomplete —
        these are often referred to as “hallucinations”. As a state employee, it is important to
        review the AI’s output for accuracy, bias, completeness, accessibility, and style before
        using it in your work.
      </p>
      <p className="mb-6">
        You can reduce hallucinations by providing clear context, uploading source materials, asking
        the AI Assistant to explain its reasoning, and including prompt instructions for the AI to
        not fabricate or guess any information. Here is an example of{' '}
        <a
          href="https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations"
          className="underline hover:decoration-2"
          target="_blank"
          rel="noreferrer"
        >
          guidance for reducing hallucinations
        </a>
        , and keep an eye out for prompting tips we will be added to the tool very soon.
      </p>
      <p className="mb-6">
        As the{' '}
        <a
          href="https://innovation.nj.gov/ai-faq-state-employees/"
          className="underline hover:decoration-2"
          target="_blank"
          rel="noreferrer"
        >
          state AI FAQ page
        </a>{' '}
        outlines, you are responsible for any work that incorporates AI-generated content. All
        employees should complete the mandatory Responsible Use of GenAI training before using the
        NJ AI Assistant or other state-approved AI tools. Training is available through{' '}
        <a
          href="https://my.nj.gov/aui/Login"
          className="underline hover:decoration-2"
          target="_blank"
          rel="noreferrer"
        >
          myNJ
        </a>
        , as a{' '}
        <a
          href="https://stateofnewjersey.sabacloud.com/Saba/Web_spf/NA9P2PRD001/common/ledetail/CLIP.RAIPP.WBT/latestversion"
          className="underline hover:decoration-2"
          target="_blank"
          rel="noreferrer"
        >
          State Learner
        </a>{' '}
        or an{' '}
        <a
          href="https://stateofnewjersey-external.sabacloud.com/Saba/Web_spf/NA9P2PRD001/common/ledetail/CLIP.RAIPP.WBT/latestversion"
          className="underline hover:decoration-2"
          target="_blank"
          rel="noreferrer"
        >
          External Learner
        </a>
        ..
      </p>

      <InfoDivider />

      <InfoSectionHeader text="Getting Started" />

      <p className="mb-2 font-bold">What&#39;s new in this version?</p>
      <p className="mb-6">
        The updated NJ AI Assistant brings a redesigned interface and expanded capabilities based on
        feedback from users like you. Along with previous functionality from version 1.0, this new
        update brings:
      </p>
      <ul className="mb-6 list-inside list-disc">
        <li className="mb-2">
          <span className="font-bold">Smarter responses</span> — Powered by an upgraded AI model
          with knowledge through October 2025
        </li>
        <li className="mb-2">
          <span className="font-bold">Visible reasoning</span> — Responses now include a
          &#34;thoughts&#34; section that shows the assistant&#39;s reasoning. Reviewing this can
          help you catch errors, verify logic, and decide whether the output is ready to use.
        </li>
        <li className="mb-2">
          <span className="font-bold">More control over your conversations</span> — Voice
          transcription, edit prompts, retry responses, and revisit past chats
        </li>
        <li className="mb-2">
          <span className="font-bold">Built-in learning resources</span> — Guides on effective
          prompting and responsible AI use, plus direct access to State AI policy
        </li>
      </ul>

      <p className="mb-2 font-bold">How do I navigate the NJ AI Assistant?</p>
      <p className="mb-6">We&#39;ve added a few ways to move around and find what you need.</p>
      <ul className="mb-6 list-inside list-disc">
        <li className="mb-2">
          <span className="font-bold">Sidebar</span> — A collapsible menu on the left side of your
          screen gives you access to your recent chats and learning resources. Look for the user
          menu at the bottom to explore guides, learn about the tool, or get in contact with us.
        </li>
        <li className="mb-2">
          <span className="font-bold">Starting a new chat</span> — You have options: type directly
          into the chat window, click the new chat button in the top right, or click the NJ AI
          Assistant logo.
        </li>
      </ul>

      <InfoDivider />

      <InfoSectionHeader text="Using the NJ AI Assistant" />

      <p className="mb-2 font-bold">How can I use the NJ AI Assistant?</p>
      <p className="mb-6">
        The NJ AI Assistant is a conversational tool that works with language. At its core, it reads
        and generates text—which means it can help you write, refine, analyze, and reorganize
        information through back-and-forth conversation.
      </p>
      <p className="mb-6">
        You can think of it as having a thinking partner or collaborator. You provide it with text
        about what you need, and it responds with new text based on your input. This makes it very
        useful for things like:
      </p>
      <ul className="mb-6 list-inside list-disc">
        <li className="mb-2">Drafting and editing content</li>
        <li className="mb-2">Summarization & synthesizing</li>
        <li className="mb-2">Analyzing and extracting information from documents</li>
        <li className="mb-2">
          Generating ideas and exploring different angles for a given problem.
        </li>
      </ul>
      <p className="mb-6">
        In addition, many agencies are independently - or in collaboration with NJIA staff - finding
        advanced use cases for the NJ AI Assistant. Feel free to contact us if you have ideas or
        questions.
      </p>

      <p className="mb-2 font-bold">What can’t I use the NJ AI Assistant for?</p>
      <p className="mb-6">
        Although the NJ AI Assistant works by generating language, there are still some things it is
        not well-suited for —
      </p>
      <ul className="mb-6 list-inside list-disc">
        <li className="mb-2">
          <span className="font-bold">Precise calculations and statistics:</span> The NJ AI
          Assistant can’t do mathematical calculations in the way a spreadsheet can. Instead, use it
          to organize qualitative information, like survey responses, into themes. Text-based AI
          Assistants are heavily prone to errors when dealing with quantitative data. Always verify
          numbers independently.
        </li>
        <li className="mb-2">
          <span className="font-bold">Executing code:</span> If you&#39;re using the AI Assistant
          for coding tasks, keep in mind that it can generate code but{' '}
          <span className="font-bold">cannot execute it</span>. Occasionally, it may simulate what
          running the code would look like—these outputs are fabricated and should be ignored. To
          avoid this, be explicit in your prompt that you only want the code, not example results.
        </li>
        <li className="mb-2">
          <span className="font-bold">Analysis without source material:</span> The NJ AI Assistant
          doesn’t have access to external databases, state systems, or real-time information. A
          broad question like “What areas of NJ are the most likely to be impacted by extreme
          weather?” won’t get a reliable answer on its own. Instead, give it something to work with:
          upload relevant reports, provide context, be specific about how you’d like it to approach
          its analysis, and ask it to show its reasoning so you can spot errors.
        </li>
      </ul>

      <p className="mb-2 font-bold">What are temporary chats?</p>
      <p className="mb-6">
        Temporary chats work like regular conversations with one key difference: they are
        automatically deleted at midnight each day.
      </p>
      <p className="mb-6">
        You can start a conversation in the morning, return to it throughout the day, and pick up
        where you left off—closing your browser tab, navigating away, or refreshing the page
        won&#39;t affect your chat. Your recent conversations will also appear in the sidebar for
        easy access.
      </p>
      <p className="mb-6">
        At midnight, all conversations and sidebar history are cleared from the site and its
        database. Due to legal and security requirements around data retention, we are not able to
        offer permanent chat history at this time.
      </p>

      <p className="mb-2 font-bold">What file types can I upload?</p>
      <p className="mb-6">The following file types are supported</p>
      <ul className="mb-6 list-inside list-disc">
        <li className="mb-2">Files: pdf, csv, xls/xlsx, docx, .txt, .md</li>
        <li className="mb-2">Code types: python, java, js, (and others)</li>
        <li className="mb-2">Images file types: jpeg, jpg, png, gif, webp, heic, heif</li>
        <li className="mb-2">
          Maximum number of files: 10 files per prompt (whether images or text)
        </li>
        <li className="mb-2">
          Maximum file size: 50 MB max per each file, and a total maximum size of 60 MB for all
          files uploaded per prompt size of 60 MB for all files uploaded per prompt
        </li>
      </ul>

      <p className="mb-2 font-bold">
        Can I enter personally identifiable information and sensitive information into the NJ AI
        Assistant?
      </p>
      <p className="mb-6">
        Employees are allowed to enter personally identifiable information (PII) and other sensitive
        information into state-approved tools (including the NJ AI Assistant), but please see the{' '}
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
        also covers this topic in detail.{' '}
      </p>

      <p className="mb-2 font-bold">Who can see the prompts I share?</p>
      <p className="mb-6">
        The data for the NJ AI Assistant is stored in a state-hosted database. Your prompts and
        responses are encrypted, and none of this information will be used as training data for AI
        models, due to the government-friendly terms of service we have with our service providers.
        For maintenance purposes, the Platform team and OIT can access the information stored in the
        database, and would only do this to resolve a bug or other app issues. (Chats are currently
        temporary, so all chats are deleted at midnight daily. Once they are deleted, they are
        permanently deleted.)
      </p>

      <p className="mb-2 font-bold">
        What is the context limit, token limit, and temperature of the NJ AI Assistant?
      </p>
      <ul className="mb-6 list-inside list-disc">
        <li className="mb-2">The context limit: 1,000,000 tokens</li>
        <li className="mb-2">Output token limit: 64,000 tokens</li>
        <li className="mb-2">Temperature: 1.0</li>
      </ul>

      <InfoDivider />

      <InfoSectionHeader text="Help & Support" />
      <p className="mb-2 font-bold">How can I get in touch with the team?</p>
      <p className="mb-6">
        To share feedback, report a problem, ask a question, or request help with prompting/using AI
        — either fill out the{' '}
        <a
          href="https://forms.office.com/g/zLiSuXxJ0Y"
          className="underline hover:decoration-2"
          target="_blank"
          rel="noreferrer"
        >
          Contact Us form
        </a>{' '}
        or send us an email at{' '}
        <a
          href="mailto:AI.Assistant@innovation.nj.gov"
          className="underline hover:decoration-2"
          target="_blank"
          rel="noreferrer"
        >
          AI.Assistant@innovation.nj.gov
        </a>{' '}
        - both go directly to the team.
      </p>

      <InfoDivider />

      <InfoSectionHeader text="Upcoming features" />
      <p className="mb-2 font-bold">What&#39;s coming next for NJ AI Assistant?</p>
      <ul className="mb-6 list-inside list-disc">
        <li className="mb-2">
          To stay updated on new features, learning resources, and all things AI, join{' '}
          <a
            href="https://public.govdelivery.com/accounts/NJGOV/signup/45878"
            className="font-normal text-primary underline hover:decoration-2"
            target="_blank"
            rel="noreferrer"
          >
            our newsletter about the NJ AI Assistant
          </a>
          .
        </li>
        <li className="mb-2">
          In the immediate future, the team is thinking about more features to support responsible
          and safe AI use. We are also writing resources and{' '}
          <a
            href="https://innovation.nj.gov/skills/ai-how-tos/"
            className="font-normal text-primary underline hover:decoration-2"
            target="_blank"
            rel="noreferrer"
          >
            how-to guides about LLM prompting best practices and AI use cases
          </a>
          .
        </li>
      </ul>

      <InfoDivider />

      <InfoSectionHeader text="AI Learning Resources" />
      <p className="mb-2 font-bold">NJ State-Developed Learning Resources</p>
      <ul className="mb-6 list-inside list-disc">
        <li className="mb-2">
          Responsible Use of GenAI training - Available on the Learning Management System
        </li>
        <li className="mb-2">
          {' '}
          <a
            href="https://innovation.nj.gov/skills/"
            className="font-normal text-primary underline hover:decoration-2"
            target="_blank"
            rel="noreferrer"
          >
            NJ Innovation Skills & Resources
          </a>{' '}
          - Written by NJIA
        </li>
        <li className="mb-2">
          <a
            href="https://innovation.nj.gov/skills/ai-how-tos/"
            className="font-normal text-primary underline hover:decoration-2"
            target="_blank"
            rel="noreferrer"
          >
            GenAI How-To Guides
          </a>{' '}
          - (includes how to build tools and improve call center menus with genAI)
        </li>
      </ul>
      <p className="mb-2 font-bold">Other Resources</p>
      <ul className="mb-6 list-inside list-disc">
        <li className="mb-2">
          <a
            href="https://innovate-us.org/"
            className="font-normal text-primary underline hover:decoration-2"
            target="_blank"
            rel="noreferrer"
          >
            InnovateUS trainings about AI
          </a>
        </li>
        <li className="mb-2">
          <a
            href="https://ai.gov.uk/knowledge-hub/prompts"
            className="font-normal text-primary underline hover:decoration-2"
            target="_blank"
            rel="noreferrer"
          >
            UK Government Prompt Library
          </a>
        </li>
        <li className="mb-2">
          <a
            href="https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview"
            className="font-normal text-primary underline hover:decoration-2"
            target="_blank"
            rel="noreferrer"
          >
            Anthropic’s prompt engineering guide - including how to
          </a>
        </li>
        <li className="mb-2">
          <a
            href="https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations"
            className="font-normal text-primary underline hover:decoration-2"
            target="_blank"
            rel="noreferrer"
          >
            Anthropic&#39;s guidance to reduce hallucinations
          </a>{' '}
          (Note: Claude is not an approved tool, do not put any state data into the tool)
        </li>
      </ul>

      <InfoSectionHeader text="Related links" />
      <div className="mb-6 space-y-3">
        <div>
          <span
            role="button"
            onClick={() => navigate('/nj/about')}
            className="inline-flex gap-1 underline hover:decoration-2"
          >
            About the AI Assistant
            <div className="inline-flex rounded bg-surface-secondary p-1">
              <svg
                className="usa-icon usa-icon--size-2"
                aria-hidden="true"
                focusable="false"
                role="img"
              >
                <use href={`${icons}#local_library`} />
              </svg>
            </div>
          </span>
        </div>

        <InfoLink
          text="New Jersey Innovation Authority"
          link="https://innovation.nj.gov/"
          icon="launch"
        />
      </div>
    </div>
  );
}
