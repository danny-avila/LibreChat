import type { FiltersConfig, MessageFilterPiiConfig } from 'librechat-data-provider';
import type { MessageMethods } from '@librechat/data-schemas';
import type { RequestHandler, Request } from 'express';
import type { PrivateTextCipher } from './crypto';
import { ContentFilterError } from '../../middleware/contentFilter';
import { createPiiTextTransformer } from '../transform';
import { createPrivateTextCipher } from './crypto';
import { inspectContent } from '../runtime';

interface PrivateTextMessage {
  messageId?: string;
  conversationId?: string | null;
  isCreatedByUser?: boolean;
  text?: string;
  privacyRevision?: string;
}

interface Capture {
  readonly userId: string;
  readonly tenantId: string;
  readonly revision: string;
  readonly text: string;
  readonly envelope: string;
  readonly cipher: PrivateTextCipher;
}

const captures = new WeakMap<object, Capture>();

function unavailable(): ContentFilterError {
  return new ContentFilterError({
    detectorId: 'pii-pattern',
    ruleId: 'private-text',
    label: 'private value that could not be protected',
    source: 'message',
    field: 'text',
    provenance: 'user',
    fragmentId: 'chat.text',
    fragmentPath: '/text',
  });
}

export function privateTextBinding(
  userId: string,
  tenantId: string,
  message: PrivateTextMessage,
): string[] {
  return [
    userId,
    tenantId,
    message.conversationId ?? '',
    message.messageId ?? '',
    message.privacyRevision ?? '',
    message.text ?? '',
  ];
}

/** Installed only on the authenticated interactive Agent chat router, before any content consumer. */
export function createPrivateTextIngress(options: {
  getFilters(req: Request): FiltersConfig | undefined;
  getLegacyPii(req: Request): MessageFilterPiiConfig | undefined;
  getKey(): string;
}): RequestHandler {
  return (req, res, next) => {
    const rule = options.getFilters(req)?.messages?.pii;
    if (rule?.action !== 'redact' || typeof req.body?.text !== 'string') {
      next();
      return;
    }
    const body = req.body as {
      text: string;
      clientRequestId?: string;
      files?: object[];
      quotes?: string[];
      isEdited?: boolean;
      isContinued?: boolean;
      isRegenerate?: boolean;
      compact?: boolean;
      overrideParentMessageId?: string;
      overrideConvoId?: string;
      addedConvo?: boolean;
      editedContent?: unknown;
      recoverySteerId?: string;
      responseMessageId?: string;
    };
    const request = req as Request & {
      user?: { id?: string; tenantId?: string | null };
      _isAgentTrigger?: boolean;
    };
    if (
      req.path === '/resume' ||
      request._isAgentTrigger === true ||
      body.isEdited ||
      body.isContinued ||
      body.isRegenerate ||
      body.compact ||
      body.editedContent != null ||
      body.recoverySteerId != null ||
      (typeof body.clientRequestId === 'string' &&
        body.clientRequestId.startsWith('steer-recovery:')) ||
      body.overrideParentMessageId ||
      body.overrideConvoId ||
      body.addedConvo ||
      body.files?.length ||
      body.quotes?.length
    ) {
      next();
      return;
    }
    try {
      const fragment = {
        id: 'chat.text',
        path: '/text',
        text: body.text,
        source: 'message',
        field: 'text',
        format: 'plain',
        treatment: 'replaceable',
        provenance: 'user',
      } as const;
      const legacy = inspectContent([fragment], { legacyPii: options.getLegacyPii(req) });
      if (legacy != null) {
        throw new ContentFilterError(legacy);
      }
      const result = createPiiTextTransformer(rule).createSession().transform(fragment);
      if (result.replacements === 0) {
        next();
        return;
      }
      const userId = request.user?.id;
      const tenantId = request.user?.tenantId ?? '';
      if (
        !userId ||
        typeof body.clientRequestId !== 'string' ||
        body.clientRequestId.length > 256
      ) {
        throw unavailable();
      }
      const cipher = createPrivateTextCipher(options.getKey());
      const revision = cipher.revision([userId, tenantId, body.clientRequestId, body.text]);
      // A keyed, turn-specific namespace prevents unrelated historical placeholders aliasing.
      const text = result.content.replace(
        /\[(EMAIL|PHONE|NAME|CREDENTIAL|CUSTOM)_(\d+)\]/g,
        (marker, category: string, index: string) =>
          body.text.includes(marker) ? marker : `[${category}_${index}_${revision}]`,
      );
      const envelope = cipher.seal(body.text, [userId, tenantId, revision]);
      captures.set(req, { userId, tenantId, revision, text, envelope, cipher });
      body.text = text;
      next();
    } catch {
      res.status(400).json({
        error: 'content_filter_block',
        message: 'Private details could not be protected. Nothing was sent to the model.',
      });
    }
  };
}

/** Only safe metadata joins the user-message projection sent to events and ordinary readers. */
export function stampPrivateTextMessage<T extends PrivateTextMessage>(
  req: object | undefined,
  message: T,
): T & { privacyRevision?: string } {
  const capture = req == null ? undefined : captures.get(req);
  if (capture != null && message.isCreatedByUser === true && message.text === capture.text) {
    message.privacyRevision = capture.revision;
  }
  return message;
}

/** Encrypts against final server-resolved message identity, then commits both views in one write. */
export async function savePrivateTextMessage(
  save: MessageMethods['saveMessage'],
  req: object | undefined,
  ...args: Parameters<MessageMethods['saveMessage']>
): ReturnType<MessageMethods['saveMessage']> {
  const [ctx, message, metadata] = args;
  const capture = req == null ? undefined : captures.get(req);
  if (capture == null || message.isCreatedByUser !== true) {
    return save(...args);
  }
  if (message.text !== capture.text) {
    throw unavailable();
  }
  if (
    ctx.userId !== capture.userId ||
    !message.messageId ||
    !message.conversationId ||
    message.newMessageId
  ) {
    throw unavailable();
  }
  const revision = capture.revision;
  const original = capture.cipher.open(capture.envelope, [
    capture.userId,
    capture.tenantId,
    revision,
  ]);
  const envelope = capture.cipher.seal(
    original,
    privateTextBinding(capture.userId, capture.tenantId, { ...message, privacyRevision: revision }),
  );
  const saved = await save(
    ctx,
    { ...message, tenantId: capture.tenantId || undefined },
    {
      ...metadata,
      privateText: { envelope, revision },
    },
  );
  if (
    saved?.privacyRevision !== revision ||
    saved.text !== capture.text ||
    saved.messageId !== message.messageId ||
    saved.conversationId !== message.conversationId
  ) {
    throw unavailable();
  }
  return saved;
}

/** Must complete before sendCompletion. Existing cancellation/deletion still owns the run. */
export async function requirePrivateTextPersistence(
  req: object | undefined,
  start: () => Promise<{ message?: PrivateTextMessage | null } | undefined>,
): Promise<void> {
  const capture = req == null ? undefined : captures.get(req);
  if (capture == null) {
    return;
  }
  const result = await start();
  if (
    result?.message?.privacyRevision !== capture.revision ||
    result.message.text !== capture.text
  ) {
    throw unavailable();
  }
}
