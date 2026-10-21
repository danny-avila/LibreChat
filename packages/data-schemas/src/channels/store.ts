import { Schema } from 'mongoose';
import { createHash, randomUUID } from 'node:crypto';
import type { ChannelEnvelope, ChannelReply, ChannelWork } from 'librechat-data-provider';
import type { IAgent } from '../types';

export interface ChannelInstallation {
  id: string;
  tenantId: string;
  ownerId: string;
  agentId: string;
  name: string;
  appId: string;
  teamId: string;
  botUserId: string;
  mode: 'http' | 'socket';
  enabled: boolean;
  credentials: string;
}
export interface ChannelAccountLink {
  installationId: string;
  tenantId: string;
  senderId: string;
  userId: string;
  session?: string;
}
interface Challenge extends ChannelAccountLink {
  tokenHash: string;
  codeHash: string;
  expiresAt: Date;
}
interface Lane {
  id: string;
  sequence: number;
  owner?: string;
  expiresAt?: Date;
}
interface Event {
  id: string;
  lane: string;
  sequence: number;
  installationId: string;
  envelope: ChannelEnvelope;
  status: ChannelWork['status'] | 'pending' | 'done' | 'uncertain';
  owner?: string;
  expiresAt: Date;
  availableAt: Date;
  reply?: ChannelReply;
  attempts: number;
  cancelled: boolean;
  slackMessageId?: string;
  userId?: string;
}

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const channelLaneId = (e: ChannelEnvelope): string =>
  digest(JSON.stringify([e.installationId, e.teamId, e.destinationId, e.threadId]));

/** All tenant access is explicit. Only the authenticated gateway may use global worker methods. */
export function createChannelStore(mongoose: typeof import('mongoose')) {
  const installationSchema = new Schema<ChannelInstallation>(
    {
      id: { type: String, required: true, unique: true },
      tenantId: { type: String, required: true },
      ownerId: { type: String, required: true },
      agentId: { type: String, required: true },
      name: { type: String, required: true },
      appId: { type: String, required: true },
      teamId: { type: String, required: true },
      botUserId: { type: String, required: true },
      mode: { type: String, enum: ['http', 'socket'], required: true },
      enabled: { type: Boolean, required: true },
      credentials: { type: String, required: true },
    },
    { timestamps: true },
  );
  installationSchema.index({ tenantId: 1, agentId: 1 }, { unique: true });
  installationSchema.index({ appId: 1, teamId: 1 }, { unique: true });
  const linkSchema = new Schema<ChannelAccountLink>(
    {
      installationId: { type: String, required: true },
      tenantId: { type: String, required: true },
      senderId: { type: String, required: true },
      userId: { type: String, required: true },
      session: String,
    },
    { timestamps: true },
  );
  linkSchema.index({ installationId: 1, tenantId: 1, senderId: 1 }, { unique: true });
  const challengeSchema = new Schema<Challenge>({
    installationId: { type: String, required: true },
    tenantId: { type: String, required: true },
    senderId: { type: String, required: true },
    userId: { type: String, default: '' },
    tokenHash: { type: String, unique: true, required: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, expires: 0 },
  });
  const envelopeSchema = new Schema<ChannelEnvelope>(
    {
      provider: { type: String, required: true },
      eventId: String,
      installationId: String,
      teamId: String,
      senderId: String,
      destinationId: String,
      threadId: String,
      messageId: String,
      sentAt: Number,
      isDirect: Boolean,
      startsThread: Boolean,
      text: String,
    },
    { _id: false },
  );
  const eventSchema = new Schema<Event>(
    {
      id: { type: String, required: true, unique: true },
      lane: { type: String, required: true },
      sequence: { type: Number, required: true },
      installationId: { type: String, required: true },
      envelope: { type: envelopeSchema, required: true },
      status: { type: String, required: true },
      owner: String,
      expiresAt: { type: Date, required: true },
      availableAt: { type: Date, required: true },
      reply: { type: new Schema<ChannelReply>({ text: String, private: Boolean }, { _id: false }) },
      attempts: { type: Number, default: 0 },
      cancelled: { type: Boolean, default: false },
      slackMessageId: String,
      userId: String,
    },
    { timestamps: true },
  );
  eventSchema.index({ lane: 1, sequence: 1 }, { unique: true });
  eventSchema.index({ status: 1, availableAt: 1, expiresAt: 1 });
  const laneSchema = new Schema<Lane>({
    id: { type: String, required: true, unique: true },
    sequence: { type: Number, default: 0 },
    owner: String,
    expiresAt: Date,
  });
  const Installation = mongoose.models.ChannelInstallation
    ? mongoose.model<ChannelInstallation>('ChannelInstallation')
    : mongoose.model<ChannelInstallation>('ChannelInstallation', installationSchema);
  const Link = mongoose.models.ChannelAccountLink
    ? mongoose.model<ChannelAccountLink>('ChannelAccountLink')
    : mongoose.model<ChannelAccountLink>('ChannelAccountLink', linkSchema);
  const Challenge = mongoose.models.ChannelChallenge
    ? mongoose.model<Challenge>('ChannelChallenge')
    : mongoose.model<Challenge>('ChannelChallenge', challengeSchema);
  const Event = mongoose.models.ChannelEvent
    ? mongoose.model<Event>('ChannelEvent')
    : mongoose.model<Event>('ChannelEvent', eventSchema);
  const Lane = mongoose.models.ChannelLane
    ? mongoose.model<Lane>('ChannelLane')
    : mongoose.model<Lane>('ChannelLane', laneSchema);
  let indexes: Promise<void> | undefined;
  const ready = () =>
    (indexes ??= Promise.all(
      [Installation, Link, Challenge, Event, Lane].map((model) => model.createIndexes()),
    )
      .then(() => undefined)
      .catch((error: unknown) => {
        indexes = undefined;
        throw error;
      }));
  const owned = (id: string, owner: string) => ({
    id,
    owner,
    expiresAt: { $gt: new Date() },
    status: { $nin: ['done', 'uncertain'] },
  });
  const asWork = (e: Event): ChannelWork => ({
    id: e.id,
    owner: e.owner!,
    status: e.status as ChannelWork['status'],
    envelope: e.envelope,
    reply: e.reply,
    attempts: e.attempts,
    userId: e.userId,
  });

  return {
    ready: (): Promise<void> => ready(),
    async agent(
      agentId: string,
    ): Promise<{ id: string; name: string; description: string; ownerId: string } | null> {
      const agent = await mongoose.model<IAgent>('Agent').findOne({ id: agentId }).lean();
      return agent
        ? {
            id: agent.id,
            name: agent.name || 'LibreChat agent',
            description: agent.description || '',
            ownerId: String(agent.author),
          }
        : null;
    },
    async installations(): Promise<ChannelInstallation[]> {
      return Installation.find().lean();
    },
    async list(tenantId: string, ownerId: string): Promise<ChannelInstallation[]> {
      return Installation.find({ tenantId, ownerId }).lean();
    },
    async get(id: string): Promise<ChannelInstallation | null> {
      return Installation.findOne({ id }).lean();
    },
    async save(value: ChannelInstallation): Promise<void> {
      await ready();
      await Installation.updateOne(
        { id: value.id, ownerId: value.ownerId, tenantId: value.tenantId },
        { $set: value },
        { upsert: true },
      );
    },
    async link(
      installationId: string,
      tenantId: string,
      senderId: string,
    ): Promise<ChannelAccountLink | null> {
      return Link.findOne({ installationId, tenantId, senderId }).lean();
    },
    async userLinks(tenantId: string, userId: string): Promise<ChannelAccountLink[]> {
      return Link.find({ tenantId, userId }).lean();
    },
    async unlink(installationId: string, tenantId: string, userId: string): Promise<void> {
      await Link.deleteMany({ installationId, tenantId, userId });
    },
    async challenge(value: Omit<Challenge, 'userId'>): Promise<void> {
      await ready();
      await Challenge.create(value);
    },
    async getChallenge(tokenHash: string): Promise<Challenge | null> {
      return Challenge.findOne({ tokenHash, expiresAt: { $gt: new Date() } }).lean();
    },
    async confirm(
      tokenHash: string,
      codeHash: string,
      tenantId: string,
      userId: string,
      session?: string,
    ): Promise<boolean> {
      const challenge = await Challenge.findOneAndDelete({
        tokenHash,
        codeHash,
        tenantId,
        expiresAt: { $gt: new Date() },
      }).lean();
      if (!challenge) return false;
      // An existing link cannot silently move to another LibreChat account.
      const filter = {
        installationId: challenge.installationId,
        tenantId,
        senderId: challenge.senderId,
      };
      const link = await Link.findOneAndUpdate(
        filter,
        { $setOnInsert: { ...filter, userId } },
        { upsert: true, new: true },
      ).lean();
      if (link?.userId !== userId) return false;
      await Link.updateOne({ ...filter, userId }, { $set: { session: session ?? null } });
      return true;
    },
    async enqueue(envelope: ChannelEnvelope): Promise<void> {
      await ready();
      const id = digest(JSON.stringify([envelope.installationId, envelope.eventId]));
      if (await Event.exists({ id })) return;
      const lane = channelLaneId(envelope);
      const sequence = await Lane.findOneAndUpdate(
        { id: lane },
        { $inc: { sequence: 1 } },
        { upsert: true, new: true },
      ).lean();
      await Event.updateOne(
        { id },
        {
          $setOnInsert: {
            id,
            lane,
            sequence: sequence!.sequence,
            installationId: envelope.installationId,
            envelope,
            status: 'pending',
            expiresAt: new Date(0),
            availableAt: new Date(),
            attempts: 0,
            cancelled: false,
          },
        },
        { upsert: true },
      );
    },
    async hasThread(envelope: ChannelEnvelope): Promise<boolean> {
      return (await Event.exists({ lane: channelLaneId(envelope) })) != null;
    },
    async claim(leaseMs: number): Promise<ChannelWork | null> {
      await ready();
      const now = new Date();
      const candidates = await Event.find({
        status: { $nin: ['done', 'uncertain'] },
        availableAt: { $lte: now },
        expiresAt: { $lte: now },
      })
        .sort({ createdAt: 1 })
        .limit(50)
        .lean();
      for (const candidate of candidates) {
        const head = await Event.findOne({
          lane: candidate.lane,
          status: { $nin: ['done', 'uncertain'] },
        })
          .sort({ sequence: 1 })
          .lean();
        if (!head || head.id !== candidate.id) continue;
        const owner = randomUUID();
        const expiresAt = new Date(now.getTime() + leaseMs);
        const lane = await Lane.findOneAndUpdate(
          { id: head.lane, $or: [{ expiresAt: { $lte: now } }, { expiresAt: { $exists: false } }] },
          { $set: { owner, expiresAt } },
          { new: true },
        ).lean();
        if (!lane) continue;
        if (head.cancelled || head.status === 'sending' || head.status === 'cleanup') {
          const event = await Event.findOneAndUpdate(
            { id: head.id, status: head.status },
            { $set: { status: 'cleanup', owner, expiresAt } },
            { new: true },
          ).lean();
          if (event) return asWork(event);
          await Lane.updateOne({ id: head.lane, owner }, { $set: { expiresAt: now } });
          continue;
        }
        const interrupted = head.status === 'running';
        const status = interrupted || head.reply ? 'ready' : 'claimed';
        const event = await Event.findOneAndUpdate(
          { id: head.id, status: head.status, expiresAt: { $lte: now } },
          {
            $set: {
              owner,
              expiresAt,
              status,
              ...(interrupted
                ? {
                    reply: {
                      text: 'The run was interrupted. Its tools may have completed. Check the result before sending a new request.',
                      private: true,
                    },
                  }
                : {}),
            },
          },
          { new: true },
        ).lean();
        if (event) return asWork(event);
        await Lane.updateOne({ id: head.lane, owner }, { $set: { expiresAt: now } });
      }
      return null;
    },
    async work(id: string, owner: string): Promise<ChannelWork | null> {
      const event = await Event.findOne(owned(id, owner)).lean();
      return event ? asWork(event) : null;
    },
    async renew(id: string, owner: string, leaseMs: number): Promise<boolean> {
      const now = new Date();
      const event = await Event.findOne({ ...owned(id, owner), cancelled: false }).lean();
      if (!event) return false;
      const expiresAt = new Date(now.getTime() + leaseMs);
      const lane = await Lane.updateOne(
        { id: event.lane, owner, expiresAt: { $gt: now } },
        { $max: { expiresAt } },
      );
      if (!lane.matchedCount) return false;
      return (await Event.updateOne(owned(id, owner), { $max: { expiresAt } })).matchedCount === 1;
    },
    async begin(id: string, owner: string, userId?: string): Promise<boolean> {
      return (
        (
          await Event.updateOne(
            { ...owned(id, owner), status: 'claimed', cancelled: false },
            { $set: { status: 'running', userId } },
          )
        ).modifiedCount === 1
      );
    },
    async reply(id: string, owner: string, reply: ChannelReply): Promise<boolean> {
      return (
        (
          await Event.updateOne(
            { ...owned(id, owner), status: { $in: ['running', 'claimed'] } },
            { $set: { status: 'ready', reply } },
          )
        ).modifiedCount === 1
      );
    },
    async sending(id: string, owner: string): Promise<boolean> {
      return (
        (
          await Event.updateOne(
            { ...owned(id, owner), status: 'ready', cancelled: false },
            { $set: { status: 'sending' }, $inc: { attempts: 1 } },
          )
        ).modifiedCount === 1
      );
    },
    async settle(
      id: string,
      owner: string,
      outcome: 'done' | 'retry' | 'uncertain',
      delayMs: number,
      slackMessageId?: string,
    ): Promise<boolean> {
      const event = await Event.findOneAndUpdate(
        owned(id, owner),
        {
          $set: {
            status: outcome === 'retry' ? 'ready' : outcome,
            expiresAt: new Date(0),
            availableAt: new Date(Date.now() + delayMs),
            slackMessageId,
          },
        },
        { new: true },
      ).lean();
      if (!event) return false;
      await Lane.updateOne({ id: event.lane, owner }, { $set: { expiresAt: new Date(0) } });
      return true;
    },
    async cancel(
      installationId: string,
      senderId: string,
      destinationId: string,
      threadId: string,
      sentAt: number = Number.MAX_SAFE_INTEGER,
    ): Promise<void> {
      await Event.updateMany(
        {
          installationId,
          'envelope.senderId': senderId,
          'envelope.destinationId': destinationId,
          'envelope.threadId': threadId,
          'envelope.sentAt': { $lte: sentAt },
          status: { $nin: ['done', 'uncertain'] },
        },
        { $set: { cancelled: true } },
      );
    },
    async history(
      envelope: ChannelEnvelope,
      maxChars: number,
    ): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
      const events = await Event.find({
        lane: channelLaneId(envelope),
        status: 'done',
        'reply.private': false,
      })
        .sort({ sequence: -1 })
        .limit(100)
        .lean();
      const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
      let size = 0;
      for (const event of events) {
        if (!event.reply) continue;
        const content = envelope.isDirect
          ? event.envelope.text
          : `[${event.envelope.senderId}] ${event.envelope.text}`;
        size += content.length + event.reply.text.length;
        if (size > maxChars) break;
        messages.unshift(
          { role: 'user', content },
          { role: 'assistant', content: event.reply.text },
        );
      }
      return messages;
    },
  };
}
export type ChannelStore = ReturnType<typeof createChannelStore>;
