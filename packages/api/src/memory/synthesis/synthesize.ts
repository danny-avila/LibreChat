import mongoose from 'mongoose';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { logger } from '@librechat/data-schemas';
import { getSummaryPrompt, getSynthesisPrompt } from './prompts';
import { readFullConversation } from './tools';
import Tokenizer from '~/utils/tokenizer';

interface SynthesisConfig {
  summaryModel: string;
  summaryApiKey: string;
  summaryBaseUrl?: string;
  synthesisModel: string;
  synthesisApiKey: string;
  synthesisBaseUrl?: string;
}

interface ConversationSummary {
  conversationId: string;
  title: string;
  summary: string;
}

interface ConversationRecord {
  conversationId: string;
  title?: string;
}

interface SynthesisRunLean {
  _id: mongoose.Types.ObjectId;
  completedAt?: Date;
}

interface UserProjectLean {
  _id: mongoose.Types.ObjectId;
  name: string;
  description?: string;
}

interface MemoryDocumentLean {
  _id: mongoose.Types.ObjectId;
  content: string;
  tokenCount: number;
}

function extractContent(content: string | Array<{ type: string; text?: string }>): string {
  if (typeof content === 'string') {
    return content;
  }
  return JSON.stringify(content);
}

async function summarizeConversation(
  conversationId: string,
  userId: string,
  config: SynthesisConfig,
): Promise<ConversationSummary | null> {
  try {
    const Conversation = mongoose.models.Conversation;
    const convo = await Conversation.findOne({ conversationId, user: userId })
      .select('conversationId title')
      .lean<ConversationRecord>();

    if (!convo) {
      return null;
    }

    const transcript = await readFullConversation(conversationId, userId);
    if (!transcript || transcript === 'No messages found.') {
      return null;
    }

    const llm = new ChatOpenAI({
      modelName: config.summaryModel,
      openAIApiKey: config.summaryApiKey,
      configuration: config.summaryBaseUrl ? { baseURL: config.summaryBaseUrl } : undefined,
      temperature: 0.3,
      maxTokens: 500,
    });

    const response = await llm.invoke([
      new SystemMessage(getSummaryPrompt()),
      new HumanMessage(`Here is the conversation to summarize:\n\n${transcript}`),
    ]);

    const summary = extractContent(response.content as string | Array<{ type: string; text?: string }>);

    if (summary.includes('NOTHING_NOTABLE')) {
      return null;
    }

    return {
      conversationId,
      title: convo.title ?? 'Untitled',
      summary,
    };
  } catch (error) {
    logger.error(`[synthesis] Error summarizing conversation ${conversationId}:`, error);
    return null;
  }
}

async function synthesizeMemoryDocument(
  summaries: ConversationSummary[],
  existingContent: string,
  scope: 'global' | 'project',
  config: SynthesisConfig,
  projectName?: string,
  projectDescription?: string,
): Promise<string> {
  const systemPrompt = getSynthesisPrompt(scope, projectName, projectDescription);

  const summaryText = summaries
    .map((s) => `### ${s.title}\n${s.summary}`)
    .join('\n\n---\n\n');

  const userMessage = existingContent
    ? `## Existing Memory Document\n\n${existingContent}\n\n---\n\n## Recent Conversation Summaries\n\n${summaryText}`
    : `## Recent Conversation Summaries\n\n${summaryText}\n\n(No existing memory document — create a new one from scratch.)`;

  const llm = new ChatOpenAI({
    modelName: config.synthesisModel,
    openAIApiKey: config.synthesisApiKey,
    configuration: config.synthesisBaseUrl ? { baseURL: config.synthesisBaseUrl } : undefined,
    temperature: 0.4,
    maxTokens: 4000,
  });

  const response = await llm.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(userMessage),
  ]);

  return extractContent(response.content as string | Array<{ type: string; text?: string }>);
}

export async function runSynthesisForScope(
  userId: string,
  scope: 'global' | 'project',
  config: SynthesisConfig,
  projectId?: string,
): Promise<void> {
  const SynthesisRun = mongoose.models.SynthesisRun;
  const Conversation = mongoose.models.Conversation;
  const MemoryDocument = mongoose.models.MemoryDocument;
  const UserProject = mongoose.models.UserProject;

  const run = await SynthesisRun.create({
    userId,
    scope,
    projectId: projectId ?? null,
    status: 'running',
    startedAt: new Date(),
  });

  try {
    const lastRun = await SynthesisRun.findOne({
      userId,
      scope,
      projectId: projectId ?? null,
      status: 'completed',
    })
      .sort({ completedAt: -1 })
      .lean<SynthesisRunLean>();

    const sinceDate = lastRun?.completedAt ?? new Date(0);

    const convoFilter: {
      user: string;
      updatedAt: { $gt: Date };
      projectId?: mongoose.Types.ObjectId;
    } = {
      user: userId,
      updatedAt: { $gt: sinceDate },
    };

    if (scope === 'project' && projectId) {
      convoFilter.projectId = new mongoose.Types.ObjectId(projectId);
    }

    const conversations = await Conversation.find(convoFilter)
      .select('conversationId title')
      .lean<ConversationRecord[]>();

    if (conversations.length === 0) {
      await SynthesisRun.findByIdAndUpdate(run._id, {
        status: 'completed',
        conversationsProcessed: 0,
        completedAt: new Date(),
      });
      return;
    }

    const summaryPromises = conversations.map((c) =>
      summarizeConversation(c.conversationId, userId, config),
    );
    const summaryResults = await Promise.all(summaryPromises);
    const summaries = summaryResults.filter((s): s is ConversationSummary => s !== null);

    if (summaries.length === 0) {
      await SynthesisRun.findByIdAndUpdate(run._id, {
        status: 'completed',
        conversationsProcessed: conversations.length,
        completedAt: new Date(),
      });
      return;
    }

    const memDocFilter: {
      userId: string;
      scope: 'global' | 'project';
      projectId?: mongoose.Types.ObjectId | null;
    } = { userId, scope };

    if (scope === 'project' && projectId) {
      memDocFilter.projectId = new mongoose.Types.ObjectId(projectId);
    } else {
      memDocFilter.projectId = null;
    }

    const existingDoc = await MemoryDocument.findOne(memDocFilter).lean<MemoryDocumentLean>();
    const existingContent = existingDoc?.content ?? '';

    let projectName: string | undefined;
    let projectDescription: string | undefined;
    if (scope === 'project' && projectId) {
      const project = await UserProject.findById(projectId).lean<UserProjectLean>();
      projectName = project?.name;
      projectDescription = project?.description;
    }

    const updatedContent = await synthesizeMemoryDocument(
      summaries,
      existingContent,
      scope,
      config,
      projectName,
      projectDescription,
    );

    const tokenCount = Tokenizer.getTokenCount(updatedContent, 'o200k_base');

    await MemoryDocument.findOneAndUpdate(
      memDocFilter,
      {
        content: updatedContent,
        tokenCount,
        userId,
        scope,
        projectId: scope === 'project' && projectId
          ? new mongoose.Types.ObjectId(projectId)
          : null,
      },
      { upsert: true, new: true },
    );

    const hadExistingContent = !!existingContent;

    await SynthesisRun.findByIdAndUpdate(run._id, {
      status: 'completed',
      conversationsProcessed: conversations.length,
      memoriesCreated: hadExistingContent ? 0 : 1,
      memoriesUpdated: hadExistingContent ? 1 : 0,
      completedAt: new Date(),
    });

    logger.info(
      `[synthesis] Completed ${scope} synthesis for user ${userId}: ` +
      `${conversations.length} conversations, ${summaries.length} summaries`,
    );
  } catch (error) {
    await SynthesisRun.findByIdAndUpdate(run._id, {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      completedAt: new Date(),
    });
    logger.error(`[synthesis] Failed ${scope} synthesis for user ${userId}:`, error);
    throw error;
  }
}

export async function runSynthesisForUser(
  userId: string,
  config: SynthesisConfig,
): Promise<void> {
  const UserProject = mongoose.models.UserProject;

  await runSynthesisForScope(userId, 'global', config);

  const projects = await UserProject.find({ userId }).lean<UserProjectLean[]>();
  for (const project of projects) {
    const projectId = project._id.toString();
    try {
      await runSynthesisForScope(userId, 'project', config, projectId);
    } catch (error) {
      logger.error(`[synthesis] Error in project synthesis for ${projectId}:`, error);
    }
  }
}
