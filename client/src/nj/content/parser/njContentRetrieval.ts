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
          {
            question: 'How can I use agents for repetitive tasks?',
            answer: `Agents are great for repetitive tasks since they save instructions and files. Without re-typing the same prompts, an agent will start knowing that information and then you can take the conversation (and work) wherever you need. 

You can start using agents with the [Platform Agents](https://ai-assistant.nj.gov/agents) for common tasks, build your own, or customize an existing Platform Agent for what you need. 

See the ["How to Build & Use Agents" guide](https://ai-assistant.nj.gov/nj/agent-guide) to learn more.`,
          },
          {
            question: 'Can I customize the Platform Agents to hone the AI response?',
            answer: `Yes, customizing a Platform Agent will allow you to define the instructions and context files. You can use this to ensure that an agent writes in your style and tone by adjusting the instructions and adding past writing samples. You can define the format further in the instructions. 

You can also create your own agent and then create duplicates to tailor it to specific tasks.`,
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
          {
            question: 'How can I start using an agent or switch agents?',
            answer: `Use agents at conversation start, mid-conversation, or use multiple agents in one conversation. To use an agent, “activate” in one of four methods: 

* Choose an agent using the selector at the top of the screen (where you usually see the AI model)   
* Select an agent in the Agent Library, shown at the top of the chat panel  
* Start a new chat conversation by typing “@\\[agent name\\],”, press enter, and the conversation starts with that agent   
* Use an agent mid-conversation by typing “@\\[agent name\\]” to activate it. The agent name appears at the top 

Once you activate an agent, you can see its name at the top of the screen, regardless of activation method. See the ["How to Build & Use Agents" guide](https://ai-assistant.nj.gov/nj/agent-guide) to learn more.`,
          },
          {
            question: 'How can I stop using an agent?',
            answer: `The agent name appears in the selector at the top when active, providing an easy way to stop using an agent (or switch to a different agent). 

At the top of the page in the selector, you will see the agent name (e.g. “Email Drafter”). Click on that to see a menu. Within the menu you will see the name of the model (“Claude Sonnet 4.5”) or other agents (“Brainstorming Buddy”). Click on the one you want.

You will see the new name in the selector, which is how you know switching agents (or switching back to the base model) worked. See the ["How to Build & Use Agents" guide](https://ai-assistant.nj.gov/nj/agent-guide) to learn more.`,
          },
          {
            question: `What's the difference between “agents” and “Agentic AI”?`,
            answer: `The NJ AI Assistant uses “agents”, an AI tool that responds to user requests by performing specific, scoped tasks based on pre-defined prompts. Agents only work when initiated by users and operate within clear boundaries. “Agentic AI” is not used in our tool, and agentic AI is a different type of AI tool with more autonomy in executing tasks.`,
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
