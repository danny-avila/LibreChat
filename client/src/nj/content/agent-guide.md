# Guide: How to Build & Use Agents

This guide shares how to build and use agents in the NJ AI Assistant, last updated June 2026\.

## What is an agent & how is it useful?

**Agents are a tool for repetitive tasks or skills you regularly use in your work. See an [overview of agents in this video](https://youtu.be/JD53f1yPvg4) or read the guide below.**

Agents remember the instructions you provide, so you can use them over and over. You create a single set of instructions (a detailed prompt) and files (for context and reference) that the agent remembers and references when working. For repeatable tasks, define instructions for a particular task, such as "write this particular report" or "draft an email." For specialized tasks, define instructions for a skill, such as "editorial style guide checker" or "policy alignment reviewer."

Like chats, you use an agent in a chat conversation and can direct the work as needed. For example, an Email Drafter agent can draft a generic email, which you then customize through follow-up prompts or feedback. Alternatively, create separate agents for different email types you write regularly. See "_How do I write an effective agent?_" for how to build an agent.

## What agents can I use?

**Access agents built by the NJ AI Assistant team or yourself:**

- **Use a Platform Agent in the Agent Library:** the NJ AI Assistant team created agents for common use cases: Email Drafter, Meeting Summarizer, Proofreader & Polisher, Prompt Improver, and Brainstorming Buddy. Find these in “Agent Library” at the top of the left sidebar. Click on one to start using it\!
- **Create your own agent in the agent panel:** write your own agent with specific instructions and reference files on the left panel with the agent icon (the robot head). The “agent panel” will open with instructions. See the “How can I create an effective agent?” for details.
  - Note: you can add the name, description, and instructions when creating an agent, but add files after saving the agent once.
- **Customize a Platform Agent:** Duplicate a Platform Agent and tailor the instructions. For example, you can take the Platform Agent “Email Drafter”, duplicate it, then add email examples and instructions to reflect your writing style and tone. See “How can I duplicate an agent?” for details.

## How do I start using an agent in the app?

Use agents at conversation start, mid-conversation, or use multiple agents in one conversation. To use an agent, “activate” in one of four methods:

- **Choose an agent using the selector at the top of the screen** (where you usually see the AI model)
- **Select an agent in the Agent Library**, shown at the top of the chat panel
- **Start a new chat conversation by typing “@\[agent name\],”** and the conversation starts with that agent
- **Use an agent mid-conversation by typing “@\[agent name\]”** to activate it. The agent name appears at the top.

**Once you activate an agent, you can see its name** at the top of the screen, regardless of activation method.

Note: Without an active agent, the selector shows the AI model (currently “Claude Sonnet 4.5”). With an active agent, it will show the agent name (like “Email Drafter”) with a feather icon.

**Choose an agent using the selector at the top of the screen**  
Use the selector to activate an agent for new or existing conversations:

1. Click on the model name at the top of the page next to NJ AI Assistant.
2. A dropdown menu appears.
3. Hover over “My Agents.”
4. Click on your desired agent to switch it.

**Select an agent in the Agent Library**  
The Agent Library lets you browse all agents. Select one to start a chat, pin the agent, and duplicate the agent:

1. On the left sidebar, click on the Chat icon.
2. Click “Agent Library” at the top of the chat panel.
3. Select an agent to start using it.

**Start a new chat conversation by typing “@\[agent name\]”**  
You can start using an agent in the same way you start a new conversation:

1. Open a new chat conversation
2. In the chat box, start your message with “@”.
3. This will show a dropdown menu: you can either start typing the name of the Agent or you can scroll down to view options.
4. Click on the name of the agent you would like to work with.

**Use an agent mid-conversation by typing “@\[agent name\]”**  
When you use multiple agents in a conversation, or want to start using one mid-conversation, switch to an agent:

1. In the chat box, start your message with “@”.
2. A dropdown menu appears: type the agent name or scroll options.
3. Click your desired agent

## How do I stop using an agent or switch agents in a conversation?

**The agent name appears in the selector at the top when active, providing an easy way to stop using an agent or switch agents.**

Note: Without an agent, the selector shows the AI model (currently "Claude Sonnet 4.5"). With an agent, it shows the agent name (like "Email Drafter") with a feather icon.

**Stop using agents**  
Use the top selector to deactivate an agent, important for using an agent temporarily then continuing without it:

1. Click the agent name at the top next to "NJ AI Assistant".
2. A menu appears.
3. To turn off all agents, select the AI model.
4. To switch agents, select a new agent from "my agents".
5. The selector changes to reflect the active option.

**Switching agents**  
To switch agents, use the selector at the top or start your next message with "@\[agent name\]".

## How can I create an effective agent?

Writing a good agent is similar to writing a good prompt, here’s some best practices. Below is an in-depth explanation and you can also [watch the explainer video](https://youtu.be/2MRLeVIS1Tw).

### Define the task that you want an agent to accomplish

Agents are best used when the task is well defined, meaning that you have a clear idea of what the task includes and what success looks like. This ensures that you know how to describe the task, articulate what the output should be, and know how to review the AI output for accuracy and completeness.

Tip: In this article about [writing good AI prompts](https://innovation.nj.gov/skills/ai-how-tos/prompts-and-context), if you can write out all the elements in the “sharing the right context” section, then you have the information needed for an agent.

### Use one agent for one defined task

Each agent should generally be created for one defined task. This helps to ensure that the instructions are focused on what “success” looks like so the agent keeps that context in executing the task. As a best practice, agents are more accurate and effective if their instructions are detailed and specific.

Good examples of a single task for an agent are: draft an email, compare this new policy to the current to highlight changes, turn this text into a structured csv for analysis, or identify the themes from this list of comments. Another way to think about this is if you can write down the task at hand without adding the word “and” or “then” as connections. (See below for tips for using multiple agents in a set of complex tasks.)

As an example, if you write a lot of emails with most going to three different primary audiences, you will probably benefit from having three agents \- one per audience type. In defining that specific task, you can get detailed in the information you provide, such as tone, output structure, examples of past emails, etc. That increased detail increases the effectiveness and accuracy of the AI response.

Note: you can create a more generalized agent (such as the general Email Drafter). This is a great starting place to get a draft. Know that the more general the agent, the more you might edit the AI output to get what you need.

### Creating an effective agent

An agent will foundationally use these three items to accomplish a task: the instructions, the file context, and the file search. There are additional elements you will see in the Agent builder panel. Let’s break these down to understand how to create an agent in the NJ AI Assistant.

**Agent Name**  
Give your agent a name that you can remember easily. When in a conversation, you can @\[agent name\] to start using an agent, so keep the name memorable and simple.

**Description**  
Describe your agent in a couple of words or sentences. This is particularly helpful if you have similar agents and want to be specific about the topic or focus.

**Instructions**  
This is where you write the foundational prompt for the agent. You want to write a prompt that articulates the task so an AI can understand it, using the best practices described in [this prompting guide](https://innovation.nj.gov/skills/ai-how-tos/prompts-and-context). The instructions can be as long or short as you need, and keep in mind that more detailed instructions result in a more accurate output.

- **Important note: Start every agent with the instruction “You are the \[agent name\], which helps to \[short description\].”**
  Without this context to start the agent instructions, you will not be able to activate agents mid-conversation effectively, as the agent will not have enough context to work.

For some tasks with longer instructions, you can also add written instructions as an attachment in the “file context” section.

**File Context**  
These files are part of the agent’s core set of instructions. It will reference these in the same way as the written “instructions” area. The context provided by these files will directly improve the agent’s response, so we recommend adding different types of context through these files. Here are different types of context that uploaded files can provide:

- Longer, more detailed instructions
  - Even better if the instructions are in a machine-friendly format, like markdown (.md), text (.txt) or code formats. You can save Word documents (.docx) in a text (.txt) format, and Google docs in a markdown (.md) format.
- Templates for the output structure
- Editorial style or content guidelines
- Examples of what “good” looks like
- Reference documents (i.e., a policy document)

Note: you will need to save the agent (with written instructions) before you can attach files with file context and file search.

**File Search**  
When completing a task, the agent will search through these files for reference. Think of these as part of the general references for the agent \- like a library the agent can use when deciding how to complete the task.

Here is how to explain the difference between file context and file search. Let’s say you want an agent to write a set of instructions for how a business gets a permit for a department. In the “file context” section, you will include the detailed instructions, output structure, editorial style guide, and examples of what “good” looks like. In the “file search” section, you could upload more examples of good permits to reference, the wider set of permitting guidelines, research papers or posts about common questions people have about permits, and more.

The agent will use this set of files as a library reference, reviewing and searching for relevant information, in creating its final response.

Note: you will need to save the agent with instructions before you can attach files with file context and file search.

**Version History**  
This allows you to see past versions of the agent, and revert the agent to a previous version. If you are iteratively testing instructions for creating an agent, this is helpful for you to revert to a past version.

**Maximum Agent Steps (in Advanced Settings)**  
This limits the maximum number of steps an agent can take before giving you a response (from the default of 25 steps). Generally, it is recommended to leave this section blank. If you notice that an agent is taking a long time to complete a response, and you have honed the instructions and file context, then you can use this to ensure you get a response faster.

**Agent Chain (in Advanced Setting)**  
Use agent chains to define a set of agents that work together to complete a task. In this scenario, agents complete a task in a designated order. For example, you want to turn your notes into a summary of a meeting, define action items, and write an email. First you create three separate agents (or use the pre-provided Platform Agents). Then use the Agent Chain feature to set up the chain. In the first agent in the chain, go to Advanced Settings and define the rest of the agents in the chain.

- Note: When you use agent chaining in an agent, it will go through that set of agents every time you activate that agent. If you use an agent often that would also be helpful in a chain for some tasks, then it is recommended that you duplicate that core agent and create the chain from a duplicated agent.

## How can I use multiple agents for a complex task?

If you have a task that is complex, then you should consider using multiple agents. As noted above, if you have a task that needs to be described with an “and” or “then”, you should use multiple agents \- specifically one for each step.

As an example, you can use an agent to analyze survey responses (especially open text responses). If you send out a survey with a question with an open text field as a response, you need to analyze the responses (which is your goal). To analyze the responses, you need to accomplish multiple tasks: identify common themes from the survey responses, hone the themes list to a final set of themes, label/tag/code each of the responses with the corresponding theme(s), and identify the top themes. This should be broken up into multiple different agents to do.

When doing more complex tasks, through “advanced settings” at the bottom of the agent panel, you can use the “agent chain (mixture-of-agents).” This will create an order for the agents to respond \- essentially creating a chain. Specifically, it will take the task that one agent accomplished and give it to another to start.

In the example above, you would connect the multiple agents mentioned here: one for identifying common themes, one for honing themes, one for labeling the comments with a theme, and one to write the summary of top themes.

Note: AI can hallucinate when counting and doing certain math calculations without code. For example, when counting comments in one theme, we have seen it hallucinate the wrong total and percent total for that theme. For this scenario, we also had the AI create a .csv of the comments with themes tagged and manually checked the calculations in excel. No matter what, always do tasks where you can check your work to identify hallucinations and fix them.

## How can I duplicate and edit an agent?

Step by step instructions on how to duplicate an agent:

1. Go to the Agent Library
2. Click the agent to duplicate; a modal appears
3. Click "duplicate"
4. The Agent Library now shows a duplicate with the date and time you duplicated it in the title
5. Click the agent icon (robot head) to open the Agent Side panel
6. Under "Select an Agent to Edit", choose the duplicated agent (with date/time in title)
7. Immediately change the name to something new or "Copy \- \[agent name\]"
8. Edit the instructions\*, attached documents, etc.\*
9. Click "save" when done
10. The agent now appears in the Agent Library, agent selector, and @ menu

## My agent is not working well, how can I improve it?

Improve an agent similarly to improving a prompt. See the "Troubleshooting Common Issues" section of the [prompting guide](https://innovation.nj.gov/skills/ai-how-tos/prompts-and-context) for specific tips.
