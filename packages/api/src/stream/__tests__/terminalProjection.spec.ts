import type { FinalEvent, ServerSentEvent } from '~/types/events';
import { projectTerminalEvent } from '../terminalProjection';

const byteLength = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), 'utf8');

/** `FinalMessageFields` carries an index signature, so nested collections read
 * back as `unknown`; these keep the assertions readable without `any`. */
const entries = (value: unknown): Array<Record<string, unknown>> =>
  (value ?? []) as Array<Record<string, unknown>>;
const filesOf = (message: unknown): Array<Record<string, unknown>> =>
  entries((message as { files?: unknown } | null | undefined)?.files);
const attachmentsOf = (message: unknown): Array<Record<string, unknown>> =>
  entries((message as { attachments?: unknown } | null | undefined)?.attachments);

/** A terminal event shaped like the one `request.js` builds, with the transient
 * prompt-building inputs still attached. */
function buildAttachmentHeavyFinal(bodyChars: number): FinalEvent {
  const body = 'D'.repeat(bodyChars);
  const base64 = 'A'.repeat(bodyChars);
  return {
    final: true,
    terminalStatus: 'complete',
    conversation: { conversationId: 'conv-1', title: 'Report' },
    title: 'Report',
    requestMessage: {
      messageId: 'um-1',
      parentMessageId: 'root',
      conversationId: 'conv-1',
      text: 'Summarize the attachment',
      sender: 'User',
      isCreatedByUser: true,
      fileContext: body,
      image_urls: [{ type: 'image_url', image_url: { url: `data:image/png;base64,${base64}` } }],
      files: [
        {
          file_id: 'f-1',
          filename: 'report.pdf',
          filepath: '/uploads/report.pdf',
          type: 'application/pdf',
          text: body,
          _id: 'mongo-id',
          __v: 0,
        },
      ],
    },
    responseMessage: {
      messageId: 'rm-1',
      parentMessageId: 'um-1',
      conversationId: 'conv-1',
      sender: 'AI',
      isCreatedByUser: false,
      content: [{ type: 'text', text: 'The report concludes that latency improved.' }],
      attachments: [
        { file_id: 'a-1', filename: 'chart.png', filepath: '/out/chart.png', text: body },
      ],
    },
  };
}

describe('projectTerminalEvent', () => {
  describe('exclusion of transient prompt data', () => {
    it('excludes fileContext, image_urls and embedded file bodies', () => {
      const projected = projectTerminalEvent(buildAttachmentHeavyFinal(64));

      expect(projected.requestMessage).not.toHaveProperty('fileContext');
      expect(projected.requestMessage).not.toHaveProperty('image_urls');
      expect(filesOf(projected.requestMessage)[0]).not.toHaveProperty('text');
      expect(attachmentsOf(projected.responseMessage)[0]).not.toHaveProperty('text');
    });

    it('excludes storage bookkeeping from nested file entries', () => {
      const projected = projectTerminalEvent(buildAttachmentHeavyFinal(64));
      const file = filesOf(projected.requestMessage)[0];

      expect(file).not.toHaveProperty('_id');
      expect(file).not.toHaveProperty('__v');
    });

    it('excludes transient fields from every runMessages entry', () => {
      const event: FinalEvent = {
        final: true,
        runMessages: [
          { messageId: 'r-1', text: 'kept', fileContext: 'X'.repeat(128) },
          {
            messageId: 'r-2',
            text: 'also kept',
            image_urls: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } }],
            files: [{ file_id: 'f-2', filename: 'a.pdf', text: 'Y'.repeat(128) }],
          },
        ],
      };

      const projected = projectTerminalEvent(event);

      expect(projected.runMessages?.[0]).not.toHaveProperty('fileContext');
      expect(projected.runMessages?.[0]?.text).toBe('kept');
      expect(projected.runMessages?.[1]).not.toHaveProperty('image_urls');
      expect(projected.runMessages?.[1]?.text).toBe('also kept');
      expect(filesOf(projected.runMessages?.[1])[0]).not.toHaveProperty('text');
    });
  });

  describe('preservation of authoritative final state', () => {
    it('keeps legitimate message content and structured response content', () => {
      const projected = projectTerminalEvent(buildAttachmentHeavyFinal(64));

      expect(projected.requestMessage?.text).toBe('Summarize the attachment');
      expect(projected.responseMessage?.content).toEqual([
        { type: 'text', text: 'The report concludes that latency improved.' },
      ]);
    });

    it('keeps attachment references and display metadata needed to render FINAL', () => {
      const projected = projectTerminalEvent(buildAttachmentHeavyFinal(64));

      expect(filesOf(projected.requestMessage)[0]).toEqual({
        file_id: 'f-1',
        filename: 'report.pdf',
        filepath: '/uploads/report.pdf',
        type: 'application/pdf',
      });
      expect(attachmentsOf(projected.responseMessage)[0]).toEqual({
        file_id: 'a-1',
        filename: 'chart.png',
        filepath: '/out/chart.png',
      });
    });

    it('keeps the terminal and reconciliation protocol fields', () => {
      const event: FinalEvent = {
        final: true,
        reconcile: true,
        reconcileReason: 'generation_replaced',
        terminalStatus: 'aborted',
        generationCreatedAt: 1234,
        aborted: true,
        earlyAbort: true,
        title: 'T',
        conversation: { conversationId: 'conv-1' },
        pendingSteers: [{ id: 's-1' } as never],
        error: { message: 'boom' },
        requestMessage: { messageId: 'um-1', fileContext: 'drop me' },
      };

      const projected = projectTerminalEvent(event);

      expect(projected).toMatchObject({
        final: true,
        reconcile: true,
        reconcileReason: 'generation_replaced',
        terminalStatus: 'aborted',
        generationCreatedAt: 1234,
        aborted: true,
        earlyAbort: true,
        title: 'T',
        conversation: { conversationId: 'conv-1' },
        error: { message: 'boom' },
      });
      expect(projected.pendingSteers).toEqual(event.pendingSteers);
      expect(projected.requestMessage).not.toHaveProperty('fileContext');
    });

    it('does not remove a legitimate text field from a message or content part', () => {
      const event: FinalEvent = {
        final: true,
        responseMessage: {
          messageId: 'rm-1',
          text: 'top level answer text',
          content: [{ type: 'text', text: { value: 'nested structured text' } }],
        },
      };

      const projected = projectTerminalEvent(event);

      expect(projected.responseMessage?.text).toBe('top level answer text');
      expect(projected.responseMessage?.content).toEqual([
        { type: 'text', text: { value: 'nested structured text' } },
      ]);
    });
  });

  describe('optional and null semantics', () => {
    it('preserves an explicit null message slot', () => {
      const event: FinalEvent = {
        final: true,
        earlyAbort: true,
        requestMessage: null,
        responseMessage: null,
      };

      const projected = projectTerminalEvent(event);

      expect(projected.requestMessage).toBeNull();
      expect(projected.responseMessage).toBeNull();
    });

    it('leaves an absent slot absent rather than inventing it', () => {
      const projected = projectTerminalEvent({ final: true } as FinalEvent);

      expect('requestMessage' in projected).toBe(false);
      expect('responseMessage' in projected).toBe(false);
      expect('runMessages' in projected).toBe(false);
    });
  });

  describe('input ownership and idempotence', () => {
    it('does not mutate the input event or its nested objects', () => {
      const event = buildAttachmentHeavyFinal(64);
      const snapshot = structuredClone(event);

      projectTerminalEvent(event);

      expect(event).toEqual(snapshot);
      expect(event.requestMessage).toHaveProperty('fileContext');
      expect(event.requestMessage).toHaveProperty('image_urls');
      expect(filesOf(event.requestMessage)[0]).toHaveProperty('text');
    });

    it('is idempotent', () => {
      const once = projectTerminalEvent(buildAttachmentHeavyFinal(64));
      const twice = projectTerminalEvent(once);

      expect(twice).toEqual(once);
    });

    it('returns the identical reference for an already-safe event', () => {
      const safe: FinalEvent = {
        final: true,
        requestMessage: { messageId: 'um-1', text: 'clean', files: [{ file_id: 'f-1' }] },
        responseMessage: { messageId: 'rm-1', content: [{ type: 'text', text: 'answer' }] },
      };

      expect(projectTerminalEvent(safe)).toBe(safe);
    });

    it('returns non-terminal events unchanged', () => {
      const chunk: ServerSentEvent = { event: 'on_message_delta', data: { delta: 'x' } };
      const created: ServerSentEvent = {
        created: true,
        message: { messageId: 'um-1', sender: 'User', isCreatedByUser: true },
        streamId: 's-1',
      };

      expect(projectTerminalEvent(chunk)).toBe(chunk);
      expect(projectTerminalEvent(created)).toBe(created);
    });
  });

  describe('payload scaling', () => {
    it('does not scale with excluded attachment bodies', () => {
      const small = byteLength(projectTerminalEvent(buildAttachmentHeavyFinal(1_000)));
      const large = byteLength(projectTerminalEvent(buildAttachmentHeavyFinal(200_000)));

      expect(byteLength(buildAttachmentHeavyFinal(200_000))).toBeGreaterThan(400_000);
      expect(large).toBe(small);
    });

    it('does not truncate legitimate response content to satisfy a size bound', () => {
      const answer = 'Legitimate answer sentence. '.repeat(5_000);
      const event: FinalEvent = {
        final: true,
        requestMessage: { messageId: 'um-1', fileContext: 'D'.repeat(200_000) },
        responseMessage: { messageId: 'rm-1', content: [{ type: 'text', text: answer }] },
      };

      const projected = projectTerminalEvent(event);

      expect((projected.responseMessage?.content as Array<{ text: string }>)[0]?.text).toBe(answer);
      expect(byteLength(projected)).toBeGreaterThan(100_000);
    });
  });
});
