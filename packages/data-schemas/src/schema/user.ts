import { Schema } from 'mongoose';
import { SystemRoles, STATEFUL_CODE_ENVIRONMENTS } from 'librechat-data-provider';
import { IUser } from '~/types';

// Session sub-schema
const SessionSchema = new Schema(
  {
    refreshToken: {
      type: String,
      default: '',
    },
  },
  { _id: false },
);

// Backup code sub-schema
const BackupCodeSchema = new Schema(
  {
    codeHash: { type: String, required: true },
    used: { type: Boolean, default: false },
    usedAt: { type: Date, default: null },
  },
  { _id: false },
);

const userSchema: Schema<IUser> = new Schema<IUser>(
  {
    name: {
      type: String,
    },
    username: {
      type: String,
      lowercase: true,
      default: '',
    },
    email: {
      type: String,
      required: [true, "can't be blank"],
      lowercase: true,
      match: [/\S+@\S+\.\S+/, 'is invalid'],
      index: true,
    },
    emailVerified: {
      type: Boolean,
      required: true,
      default: false,
    },
    password: {
      type: String,
      trim: true,
      minlength: 8,
      maxlength: 128,
      select: false,
    },
    avatar: {
      type: String,
      required: false,
    },
    provider: {
      type: String,
      required: true,
      default: 'local',
    },
    role: {
      type: String,
      default: SystemRoles.USER,
    },
    googleId: {
      type: String,
    },
    facebookId: {
      type: String,
    },
    openidId: {
      type: String,
    },
    openidIssuer: {
      type: String,
    },
    samlId: {
      type: String,
    },
    ldapId: {
      type: String,
    },
    githubId: {
      type: String,
    },
    discordId: {
      type: String,
    },
    appleId: {
      type: String,
    },
    plugins: {
      type: Array,
    },
    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    totpSecret: {
      type: String,
      select: false,
    },
    backupCodes: {
      type: [BackupCodeSchema],
      select: false,
    },
    pendingTotpSecret: {
      type: String,
      select: false,
    },
    pendingBackupCodes: {
      type: [BackupCodeSchema],
      select: false,
      default: undefined,
    },
    refreshToken: {
      type: [SessionSchema],
    },
    expiresAt: {
      type: Date,
      expires: 604800, // 7 days in seconds
    },
    termsAccepted: {
      type: Boolean,
      default: false,
    },
    termsAcceptedAt: {
      type: Date,
      default: null,
    },
    personalization: {
      type: {
        memories: {
          type: Boolean,
          default: true,
        },
        statefulCodeEnvironment: {
          type: String,
          enum: STATEFUL_CODE_ENVIRONMENTS,
          default: 'user',
        },
      },
      default: {},
    },
    favorites: {
      type: [
        {
          _id: false,
          agentId: { type: String, maxlength: 256 },
          model: { type: String, maxlength: 256 },
          endpoint: { type: String, maxlength: 256 },
          spec: { type: String, maxlength: 256 },
        },
      ],
      default: [],
    },
    skillStates: {
      type: Map,
      of: Boolean,
      default: () => new Map(),
    },
    /**
     * Durable account-deletion barrier. Set BEFORE the deletion cascade quiesces
     * anything, so every later scheduling admission (create/update/run-now, engine
     * claim, loopback fire) can refuse this user. Absent means live, so existing
     * documents need no migration.
     */
    deletionRequestedAt: {
      type: Date,
    },
    /** Last deferred-deletion sweep attempt; rotates the sweep's bounded window so a
     *  cascade that keeps deferring cannot starve pending deletions behind it. */
    deletionSweepAt: {
      type: Date,
    },
    /** Set ONLY by deletion paths committed to automatic completion (the self-service
     *  controller). The CLI raises the admission barrier too but can refuse and exit,
     *  and the deferred-deletion sweep must never consume a barrier that path left —
     *  it would delete an account (and transactions the operator chose to retain)
     *  after the CLI reported the deletion as refused. */
    deletionCommittedAt: {
      type: Date,
    },
    /**
     * Stream ids whose deletion-side abort has NOT been acknowledged: the shared job
     * went terminal at the abort CAS, but the signal provably never left the aborting
     * replica, so a peer owner may still be generating. Durable and TTL-free ON
     * PURPOSE — the fence has to outlive any publication outage, and expiry must
     * never be mistaken for settlement. Stamped BEFORE the abort (a failed stamp
     * refuses the abort, which is side-effect free) and cleared only once the signal
     * leaves the replica or the job is gone.
     */
    deletionAbortFences: {
      type: [String],
      default: undefined,
    },
    /** Expiring failover leases for persistence that remains live while its primary
     *  finalization lease store is unavailable. Absent on unaffected users. */
    finalizationFallbackLeases: {
      type: Map,
      of: Date,
      default: undefined,
    },
    /** Field for external source identification (for consistency with TPrincipal schema) */
    idOnTheSource: {
      type: String,
      sparse: true,
    },
    tenantId: {
      type: String,
      index: true,
    },
  },
  { timestamps: true },
);

userSchema.index({ email: 1, tenantId: 1 }, { unique: true });
// Pending-deletion sweep: bounded least-recently-attempted reads over the rare rows
// whose barrier is up. Partial, so the index stays empty on healthy collections and
// the every-5-minutes pass never touches more than the deleting handful.
userSchema.index(
  { deletionSweepAt: 1, deletionRequestedAt: 1 },
  { partialFilterExpression: { deletionRequestedAt: { $exists: true } } },
);
userSchema.index({ role: 1, tenantId: 1 });
userSchema.index({ idOnTheSource: 1, openidIssuer: 1, tenantId: 1 });

const oAuthIdFields = [
  'googleId',
  'facebookId',
  'openidId',
  'samlId',
  'ldapId',
  'githubId',
  'discordId',
  'appleId',
] as const;

for (const field of oAuthIdFields) {
  if (field === 'openidId') {
    userSchema.index(
      { openidId: 1, openidIssuer: 1, tenantId: 1 },
      { unique: true, partialFilterExpression: { openidId: { $exists: true } } },
    );
    continue;
  }

  userSchema.index(
    { [field]: 1, tenantId: 1 },
    { unique: true, partialFilterExpression: { [field]: { $exists: true } } },
  );
}

export default userSchema;
