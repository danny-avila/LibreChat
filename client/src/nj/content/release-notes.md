# Release notes

---
## June 29, 2026

Features Released:

* **Agents** — We've heard from many of you that you use NJ AI Assistant for the same types of tasks over and over. Agents let you save instructions and files once, then reuse them anytime — no need to retype the same prompts repeatedly.  The agents are easy to use and include useful features that allow you to:
  * **Get started immediately with Platform Agents** — Use [ready-made agents](https://ai-assistant.nj.gov/agents) for common tasks like drafting emails, summarizing meetings, proofreading documents, brainstorming ideas, and improving prompts.
  * **Build agents for your specific workflow** — Create custom agents using the agent builder in the left sidebar. Add detailed instructions and reference files for tasks you do regularly, like drafting reports using a structured format and align them with specific policies.
  * **Add multiple files to improve the AI response** — Add files to provide context and direction so your agent produces a high-quality output and saves you time.
  * **Link multiple agents to perform complex tasks** — For complex tasks, you define multiple agents needed for a complex task and link them to work in a specific order. Each agent will do their task and then pass it off to the next agent (called “agent chaining”).

See more details about agents in the ["How to Build & Use Agents" guide](https://ai-assistant.nj.gov/nj/agent-guide).

## June 17, 2026

Features Released:

- **Chat management** \- We have heard users share that people use chats for a variety of projects, and that more ways to manage chats would be incredibly helpful. We are releasing two ways to do this:
  - **Organize chats into project folders** — Organize multiple chats into a project folder to keep everything together and easily find related chats.
  - **Pin a chat** — Keep your favorite chats at the top of the chat list by pinning them (and unpin them when you finish with them).

## June 08, 2026

Features Released:

- **Saved files functionality** — Your uploaded files now have a home. They're automatically saved to a dedicated Saved Files panel in the left sidebar, organized by upload date — Today, Yesterday, and Previous. Since files aren't tied to a specific chat, you can reuse them across any conversation — no re-uploading needed. You also have controls to manage your saved files:
  - **Pin a file** — Hover over any file and select Pin from the menu to keep it at the top of the panel for quick access. There’s no limit on the number of files you can pin.
  - **Rename a file** — Hover over any file and select Rename to update its title.
  - **Reuse a file** — Click any saved file to attach it to an ongoing or a new chat.

## April 28, 2026

Features Released:

- **Reduce LLM Response Time** \- We have multiple reports of the AI Assistant being slower to respond to users. We investigated this and found two causes.
  - Sonnet 4.6 has a slower response time than Sonnet 4.5. Due to this, we are reverting the entire app back to Sonnet 4.5.
  - Guardrail review also delays the response, as it reviews the entire AI response before sharing it. We are changing how guardrails work so that the content is reviewed as it is shared with users, reducing the lag for review.

We are continuing to develop and test key features, coming to you soon.

## April 21, 2026

Features Released:

- **A New AI Prompting Guide** — Our team created [this prompting guide](https://innovation.nj.gov/skills/ai-how-tos/prompts-and-context) to walk through how to use prompts and context to improve AI results. This covers how to think about AI tools, general prompt tips, concrete actions to improve the AI response quality and reduce hallucinations, a checklist to review AI outputs, and a troubleshooting guide.

Bugs & Improvements:

- Feature Flags — We added the ability to easily turn features on/off for the team. This will help us build features that are more complex, test them, and release them when ready.

Beyond this, we are working on a couple of big features that will be coming soon\!

## April 14, 2026

Features Released:

- **Upgrading to Claude Sonnet 4.6** — All new chats will use this upgraded model.
  - Note: If you continue an existing chat, these will continue to use Sonnet 4.5 automatically.
- **Archiving Chats** — We are automatically archiving chats that are more than 60 days old. You can access archived chats using the bottom left menu
- **Limit File Size for Uploads** — Files up to 15 MB can be uploaded to the app, and users with files larger than this will get an error message.
  - If you need to upload a file larger than 15 MB, please use our email ([AI.Assistant@innovation.nj.gov](mailto:AI.Assistant@innovation.nj.gov)) or the contact form to let us know.
- **Displaying Model Information** — Users can see the model information on the bottom left menu, including the knowledge base cutoff and the release date
- **Updated Instructions for AI Office Hours** — We updated the AI Office Hours below, so people can book time 1:1 with the team
- **UI Changes** — We also freshened up the look of the app to align with the NJ Web Design System, which is built to be more readable and accessible

Bug Fixes & Improvements:

- None beyond what is listed above.

## April 7, 2026

Features Released:

- **AI Office Hours** — Join weekly AI Office Hours to discuss AI, a project you’re working on, or feedback about the NJ AI Assistant. [Book time on any Thursday](https://outlook.office365.com/book/AIOfficeHours1@SoNJ.onmicrosoft.com/s/5Hx9mVbMJUK8H1YcXwEr6A2?ismsaljsauthenabled) with the team.
  - Note: You can also access this information on the [FAQs and Guides page](https://ai-assistant.nj.gov/nj/guide) under the “Help & Support” section.
- **Alert for Announcements and Updates** — This alert will surface new features and resources that are particularly useful for users. You can see it in the top right corner when there is new information to share
- **Release notes page** — Users can easily see the new features, bugs fixed, or infrastructure changes made in the release notes.

Bug Fixes & Improvements:

- We removed code around the data retention of files. Doing this cleans up our codebase, which makes long-term maintenance of our code easier

We also retired the original NJ AI Assistant on March 27\. We are grateful for the foundation that the original app established and the service it provided to users.

## March 25, 2026

Features Released:

- **Chat history management** — Manage your chats through re-naming them, archiving them, and duplicating them as needed.
  - You can also see your archived chats in the user menu on the bottom right
- **Updated Guides & FAQs Page** — Easily find what you need on the re-designed FAQs about how to use AI responsibly on this page with the updated look

Bug Fixes & Improvements:

- We have increased our scaling capabilities to stabilize the app
- We have resolved a server error that has shown up for some users in chat history

## March 12, 2026

The updated NJ AI Assistant brings a redesigned interface and expanded capabilities based on feedback from users like you. Along with previous functionality from version 1.0, this new update brings:

- **Smarter responses** — Powered by an upgraded AI model with knowledge through October 2025
- **Chat history** — See past chats, and continue chats of a particular topic in the same conversation thread
- **Visible reasoning** — Responses now include a "thoughts" section that shows the assistant's reasoning. Reviewing this can help you catch errors, verify logic, and decide whether the output is ready to use.
- **More control over your conversations** — Voice transcription, edit prompts, retry responses, and revisit past chats
- **Built-in learning resources** — Guides on effective prompting and responsible AI use, plus direct access to State AI policy

**How do I navigate the NJ AI Assistant?**

We've added a few ways to move around and find what you need.

- **Sidebar** — A collapsible menu on the left side of your screen gives you access to your recent chats and learning resources. Look for the user menu at the bottom to explore guides, learn about the tool, or get in contact with us.
- **Starting a new chat** — You have options: type directly into the chat window, click the new chat button in the top right, or click the NJ AI Assistant logo.
