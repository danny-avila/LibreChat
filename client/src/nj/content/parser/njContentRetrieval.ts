import updateWidget from '~/nj/content/update-widget.md?raw';

export type FAQ = {
  question: string;
  answer: string;
};

export type FAQSection = {
  title: string;
  faqs: FAQ[];
};

export type AIAssistantWarning = {
  title: string;
  warning: string;
};

export type GuideContent = {
  faqSections: FAQSection[];
  aiAssistantWarning: AIAssistantWarning;
};

export function getGuideContent(): GuideContent {
  /**
   * For the moment, this is all hardcoded; but someday, we'll want to drive this from a Markdown
   * file in the repo (which can be more easily updated).
   *
   * Note that all content below should be in Markdown.
   */
  return {
    faqSections: [
      {
        title: 'Getting Started',
        faqs: [
          {
            question: 'How do I write a prompt that will get good results?',
            answer:
              'Our team created [this prompting guide](https://innovation.nj.gov/skills/ai-how-tos/prompts-and-context) to walk through how to use prompts and context to improve AI results. This covers how to think about AI tools, general prompt tips, concrete actions to improve the AI response quality and reduce hallucinations, a checklist to review AI outputs, and a troubleshooting guide.',
          },
          {
            question: 'Are there AI Office Hours to support my AI work?',
            answer:
              'Join weekly AI Office Hours to discuss AI, a project you’re working on, or feedback about the NJ AI Assistant. [Book time on any Thursday](https://outlook.office365.com/book/AIOfficeHours1@SoNJ.onmicrosoft.com/s/5Hx9mVbMJUK8H1YcXwEr6A2?ismsaljsauthenabled) with the team.',
          },
        ],
      },
      {
        title: 'Using the NJ AI Assistant',
        faqs: [
          {
            question: 'How can I use the NJ AI Assistant?',
            answer: `The NJ AI Assistant is a conversational tool that works with language. At its core, it reads and generates text—which means it can help you write, refine, analyze, and reorganize information through back-and-forth conversation. 

You can think of it as having a thought partner or collaborator. You provide it with instructions  about what you need, and it responds with new text. This makes it very useful for things like: 

* Drafting and editing content  
* Summarizing and synthesizing content  
* Analyzing and extracting information from documents  
* Generating ideas and exploring different angles for a given problem

In addition, many agencies are independently \\- or in collaboration with NJIA staff \\- finding advanced use cases for the NJ AI Assistant. Feel free to contact us if you have ideas or questions.`,
          },
          {
            question: "What can't I use the NJ AI Assistant for?",
            answer: `Although the NJ AI Assistant works by generating language, there are still some things it is not well-suited for:

* **Precise calculations and statistics:** The NJ AI Assistant can’t do mathematical calculations in the way a spreadsheet can. Instead, use it to organize qualitative information, like survey responses, into themes. Text-based AI Assistants are heavily prone to errors when dealing with quantitative data. Always verify numbers independently.  
* **Executing code**: If you're using the AI Assistant for coding tasks, keep in mind that it can generate code but **cannot execute it**. Occasionally, it may simulate what running the code would look like—these outputs are fabricated and should be ignored. To avoid this, be explicit in your prompt that you only want the code, not example results.  
* **Analysis without source material:** The NJ AI Assistant doesn’t have access to external databases, state systems, or real-time information. A broad question like “what areas of NJ are the most likely to be impacted by extreme weather?” won’t get a reliable answer on its own. Instead, give it something to work with: upload relevant reports, provide context, be specific about how you’d like it to approach its analysis, and ask it to show its reasoning so you can spot errors.`,
          },
          {
            question: 'What file types can I upload?',
            answer: `The following file types are supported:

* Files: pdf, csv, xls/xlsx, docx, .txt, .md,   
* Code types: python, java, js, (and others)  
* Image file types: jpeg, jpg, png, gif, webp, heic, heif  
* Maximum number of files: 10 files per prompt (whether images or text)  
* Maximum file size: 15 MB max per each file, and a total maximum size of 60 MB for all files uploaded per prompt`,
          },
          {
            question:
              'Can I enter personally identifiable information and sensitive information into the NJ AI Assistant?',
            answer:
              'Employees are allowed to enter personally identifiable information (PII) and other sensitive information into state-approved tools (including the NJ AI Assistant), but please see the [official FAQ](https://innovation.nj.gov/ai-faq-state-employees/) for guidance before doing so. The State’s [current policy](https://nj.gov/it/docs/ps/25-OIT-001-State-of-New-Jersey-Guidance-on-Responsible-Use-of-Generative-AI.pdf) on responsible use of AI technology also covers this topic in detail.',
          },
          {
            question: 'Who can see the prompts I share?',
            answer: `The data for the NJ AI Assistant is stored in a state-hosted database. Your prompts and responses are encrypted, and none of this information will be used as training data for AI models, due to the government-friendly terms of service we have with our service providers. 

Chat history, similar to other state work-related documents, is retained in accordance with state records retention policies and may be subject to open records requests (OPRA). Consult with your agency’s records custodians for more information. 

For maintenance purposes, the Platform team and OIT can access the information stored in the database, and would only access this information in response to a user request to help with a technical issue or if legally required.`,
          },
          {
            question:
              'What is the context limit, token limit, and temperature of the NJ AI Assistant?',
            answer: `* The context limit: 1,000,000 tokens  
* Output token limit: 64,000 tokens  
* Temperature: 1.0 `,
          },
        ],
      },
      {
        title: 'Help & Support',
        faqs: [
          {
            question: 'How can I get in touch with the team?',
            answer:
              'To share feedback, report a problem, ask a question, or request help with prompting/using AI  — either fill out the [Contact Us](https://forms.office.com/g/zLiSuXxJ0Y) form or send us an email at [AI.Assistant@innovation.nj.gov](mailto:AI.Assistant@innovation.nj.gov) — both go directly to the team.',
          },
        ],
      },
      {
        title: 'Upcoming features',
        faqs: [
          {
            question: "What's coming next for NJ AI Assistant?",
            answer: `* To stay updated on new features, learning resources, and all things AI, join [our newsletter about the NJ AI Assistant](https://public.govdelivery.com/accounts/NJGOV/signup/45878).   
* To hear specifically about release features, check out our [Release Notes](https://ai-assistant.nj.gov/nj/release-notes) page.   
* In the immediate future, the team is thinking about more features to support responsible and safe AI use. We are also writing how-to guides for effective prompting and sharing AI use cases.`,
          },
        ],
      },
    ],
    aiAssistantWarning: {
      title: 'Using the AI Assistant Responsibly',
      warning: `AI tools can generate responses that sound confident but are incorrect or incomplete — these are often referred to as “hallucinations”. As a state employee, it is important to review the AI’s output for accuracy, bias, completeness, accessibility, and style before using it in your work.

You can reduce hallucinations by providing clear context, uploading source materials, asking the AI Assistant to explain its reasoning, and including prompt instructions for the AI to not fabricate or guess any information. Here is an example of guidance for [reducing hallucinations](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations), and keep an eye out for prompting tips we will add to the tool very soon. 

As the [state AI FAQ page](https://innovation.nj.gov/ai-faq-state-employees/) outlines, you are responsible for any work that incorporates AI-generated content. All employees should complete the mandatory Responsible Use of GenAI training before using the NJ AI Assistant or other state-approved AI tools. Training is available through [myNJ](https://my.nj.gov/aui/Login), as a [State Learner](https://stateofnewjersey.sabacloud.com/Saba/Web_spf/NA9P2PRD001/common/ledetail/CLIP.RAIPP.WBT/latestversion) or an [External Learner](https://stateofnewjersey-external.sabacloud.com/Saba/Web_spf/NA9P2PRD001/common/ledetail/CLIP.RAIPP.WBT/latestversion).`,
    },
  };
}

export type UpdateWidgetContent = {
  date: Date;
  title: string;
  description: string;
  linkText: string;
  linkUrl: string;
};

export function getUpdateWidgetContent(source: string = updateWidget): UpdateWidgetContent {
  const sections = source
    .split(/\n?#[^\n]+\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    date: new Date(sections[0]),
    title: sections[1],
    description: sections[2],
    linkText: sections[3],
    linkUrl: sections[4],
  };
}
