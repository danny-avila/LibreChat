import { getSafeErrorMetadata } from '~/utils/errors';

interface RecoveryIntent {
  fileId: string;
  writerId: string;
  state: string;
  skillId: { toString(): string };
}

interface RecoveryResult {
  status: 'missing' | 'changed' | 'recovered';
  state?: 'committed' | 'abandoned';
}

export interface SkillUploadRecoveryCliDeps {
  connect: () => Promise<unknown>;
  disconnect: () => Promise<unknown>;
  runAsSystem: <T>(callback: () => Promise<T>) => Promise<T>;
  getIntent: (fileId: string) => Promise<RecoveryIntent | null>;
  listIntents: (skillId: string) => Promise<RecoveryIntent[]>;
  recoverStoppedIntent: (fileId: string, writerId: string) => Promise<RecoveryResult>;
  write: (message: string) => void;
  writeError: (message: string) => void;
}

/** Operator entry point: the confirmation means all API upload writers were stopped or drained. */
export async function runSkillUploadRecoveryCli(
  args: string[],
  deps: SkillUploadRecoveryCliDeps,
): Promise<number> {
  const [action, fileId, writerId, confirmation] = args;
  const inspect = action === 'inspect' && args.length === 2 && Boolean(fileId);
  const inspectSkill = action === 'inspect-skill' && args.length === 2 && Boolean(fileId);
  const recover =
    action === 'recover' &&
    args.length === 4 &&
    Boolean(fileId) &&
    Boolean(writerId) &&
    confirmation === '--confirm-writers-drained';
  if (args.length === 1 && (action === '--help' || action === '-h')) {
    deps.write(
      'Usage: recover-skill-upload inspect-skill <skillId> | inspect <fileId> | recover <fileId> <writerId> --confirm-writers-drained. Stop or drain all API upload writers before recovery.',
    );
    return 0;
  }
  if (!inspect && !inspectSkill && !recover) {
    deps.writeError(
      'Usage: recover-skill-upload inspect-skill <skillId> | inspect <fileId> | recover <fileId> <writerId> --confirm-writers-drained. Stop or drain all API upload writers before recovery.',
    );
    return 2;
  }

  let connected = false;
  try {
    await deps.connect();
    connected = true;
    if (inspectSkill) {
      const intents = await deps.runAsSystem(() => deps.listIntents(fileId));
      deps.write(
        JSON.stringify(
          intents.map((intent) => ({
            fileId: intent.fileId,
            writerId: intent.writerId,
            skillId: intent.skillId.toString(),
            state: intent.state,
          })),
        ),
      );
      return 0;
    }
    if (inspect) {
      const intent = await deps.runAsSystem(() => deps.getIntent(fileId));
      if (!intent) {
        deps.writeError(`No upload intent found for ${fileId}`);
        return 1;
      }
      deps.write(
        JSON.stringify({
          fileId: intent.fileId,
          writerId: intent.writerId,
          skillId: intent.skillId.toString(),
          state: intent.state,
        }),
      );
      return 0;
    }

    const result = await deps.runAsSystem(() => deps.recoverStoppedIntent(fileId, writerId));
    if (result.status !== 'recovered') {
      deps.writeError(
        `Upload intent ${fileId} was ${result.status}; inspect it again before retrying`,
      );
      return 1;
    }
    deps.write(`Recovered ${fileId} as ${result.state}`);
    return 0;
  } finally {
    if (connected) await deps.disconnect();
  }
}

/** Keep operational errors at the process boundary without exposing driver details. */
export async function runSkillUploadRecoveryCommand(
  args: string[],
  deps: SkillUploadRecoveryCliDeps,
): Promise<number> {
  try {
    return await runSkillUploadRecoveryCli(args, deps);
  } catch (error) {
    deps.writeError(JSON.stringify(getSafeErrorMetadata(error)));
    return 1;
  }
}
