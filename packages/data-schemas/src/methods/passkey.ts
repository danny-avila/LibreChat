import { MAX_PASSKEYS_PER_USER } from 'librechat-data-provider';
import type { DeleteResult } from 'mongoose';
import type { IPasskey, PasskeyCreateData } from '~/types';
import logger from '~/config/winston';

export { MAX_PASSKEYS_PER_USER };

export interface PasskeyMethods {
  createPasskey: (data: PasskeyCreateData) => Promise<IPasskey>;
  findPasskeysByUser: (userId: string) => Promise<IPasskey[]>;
  findPasskeyByCredentialId: (credentialId: string) => Promise<IPasskey | null>;
  countPasskeysByUser: (userId: string) => Promise<number>;
  recordPasskeyUse: (credentialId: string, counter: number) => Promise<boolean>;
  renamePasskey: (passkeyId: string, userId: string, name: string) => Promise<IPasskey | null>;
  deletePasskey: (passkeyId: string, userId: string) => Promise<DeleteResult>;
  deletePasskeysByUser: (userId: string) => Promise<DeleteResult>;
}

/** The shapes a `Buffer` schema field can come back as, depending on `lean()`. */
type StoredBinary = Buffer | Uint8Array | { buffer: Buffer };

/**
 * `lean()` skips Mongoose casting, so a `Buffer` field arrives as the driver's
 * BSON `Binary`. `new Uint8Array(binary)` silently yields zero bytes, which
 * would make every signature check fail. Normalize at the data-layer boundary
 * so callers can trust the declared `Buffer` type.
 */
function toBuffer(value: StoredBinary): Buffer {
  if (Buffer.isBuffer(value)) {
    return value;
  }
  if ('buffer' in value && Buffer.isBuffer(value.buffer)) {
    return value.buffer;
  }
  return Buffer.from(value as Uint8Array);
}

function normalizePasskey<T extends IPasskey | null>(passkey: T): T {
  if (passkey?.publicKey) {
    passkey.publicKey = toBuffer(passkey.publicKey as StoredBinary);
  }
  return passkey;
}

export function createPasskeyMethods(mongoose: typeof import('mongoose')): PasskeyMethods {
  /** Registers a newly verified credential for a user. */
  async function createPasskey(data: PasskeyCreateData): Promise<IPasskey> {
    const Passkey = mongoose.models.Passkey;
    return (await Passkey.create(data)) as IPasskey;
  }

  /** Lists a user's credentials, newest first. */
  async function findPasskeysByUser(userId: string): Promise<IPasskey[]> {
    const Passkey = mongoose.models.Passkey;
    const passkeys = (await Passkey.find({ user: userId })
      .sort({ createdAt: -1 })
      .lean()
      .exec()) as unknown as IPasskey[];
    return passkeys.map(normalizePasskey);
  }

  /**
   * Looks up a credential by its authenticator-supplied ID. Called before the
   * caller is authenticated, so it is intentionally not scoped to a user.
   */
  async function findPasskeyByCredentialId(credentialId: string): Promise<IPasskey | null> {
    const Passkey = mongoose.models.Passkey;
    const passkey = (await Passkey.findOne({ credentialId }).lean().exec()) as IPasskey | null;
    return normalizePasskey(passkey);
  }

  async function countPasskeysByUser(userId: string): Promise<number> {
    const Passkey = mongoose.models.Passkey;
    return await Passkey.countDocuments({ user: userId }).exec();
  }

  /**
   * Persists the authenticator's signature counter after a successful assertion.
   *
   * For counter-capable authenticators this is the compare-and-swap that makes
   * clone detection meaningful: the update only matches while the stored counter
   * is still strictly below the asserted one, so of two assertions that verified
   * concurrently against the same stored value exactly one can commit. The caller
   * must reject the losing assertion. Authenticators that do not implement a
   * counter report 0 forever and carry no clone signal, so they only restamp
   * `lastUsedAt`.
   *
   * Returns whether this assertion won the transition. A storage error fails closed
   * for counter-capable credentials: letting the sign-in through would forfeit the
   * clone signal exactly when the transition cannot be proven, and a database that
   * cannot take this write cannot mint the session either. A counterless credential
   * has no signal to forfeit, so it is not held to the same bar.
   */
  async function recordPasskeyUse(credentialId: string, counter: number): Promise<boolean> {
    try {
      const Passkey = mongoose.models.Passkey;
      const filter =
        counter > 0
          ? { credentialId, counter: { $lt: counter } }
          : { credentialId, counter: { $lte: 0 } };
      const result = await Passkey.updateOne(filter, {
        $set: { counter, lastUsedAt: new Date() },
      }).exec();
      return result.matchedCount > 0;
    } catch (error) {
      logger.error('[recordPasskeyUse] Failed to persist passkey counter', error);
      return counter === 0;
    }
  }

  async function renamePasskey(
    passkeyId: string,
    userId: string,
    name: string,
  ): Promise<IPasskey | null> {
    const Passkey = mongoose.models.Passkey;
    return (await Passkey.findOneAndUpdate(
      { _id: passkeyId, user: userId },
      { name },
      { new: true },
    )
      .lean()
      .exec()) as IPasskey | null;
  }

  async function deletePasskey(passkeyId: string, userId: string): Promise<DeleteResult> {
    const Passkey = mongoose.models.Passkey;
    return await Passkey.deleteOne({ _id: passkeyId, user: userId }).exec();
  }

  async function deletePasskeysByUser(userId: string): Promise<DeleteResult> {
    const Passkey = mongoose.models.Passkey;
    return await Passkey.deleteMany({ user: userId }).exec();
  }

  return {
    createPasskey,
    findPasskeysByUser,
    findPasskeyByCredentialId,
    countPasskeysByUser,
    recordPasskeyUse,
    renamePasskey,
    deletePasskey,
    deletePasskeysByUser,
  };
}
