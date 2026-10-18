import { OrganizationErrorCode, OrganizationInviteKind } from 'librechat-data-provider';
import type { Request, Response, NextFunction } from 'express';
import type { OrganizationAccount } from './service';
import type { OrganizationResult } from './types';
import type { InviteService } from './invites';
import { parseOrganizationName } from './service';
import { isOrganizationsEnabled } from './mode';

/** What a registration in organizations mode adds to the new login account. */
export interface OrganizationRegistration {
  /** Fields stored on the account record when it is created. */
  accountFields: {
    pendingOrganization?: { name: string };
    pendingInviteId?: string;
    emailVerified?: boolean;
  };
  /** Runs once the account exists (an email invite joins its organization right away). */
  onAccountCreated?: (account: OrganizationAccount) => Promise<void>;
}

/** The registration body fields organizations mode reads. */
export interface OrganizationRegistrationInput {
  organization?: { name?: unknown } | null;
  organizationInvite?: unknown;
}

/**
 * Decides what a registration creates in organizations mode:
 *
 * - With an invite: an email invite must name the registering address, which it proves, so
 *   the account is verified and joins at once; a link invite is redeemed on the first sign-in
 *   after the email is verified.
 * - Without one: an organization name is required, and the organization (with the account
 *   as its admin) is created on the first sign-in after verification. Unverified sign-ups
 *   expire, so they never leave an organization behind.
 */
export function createRegistrationPlanner(deps: {
  invites: Pick<InviteService, 'checkRegistrationInvite' | 'redeemInvite'>;
  /** Login accounts that exist, counted in the accounts tenant registration runs in. */
  countAccounts: () => Promise<number>;
  claimPlatformOperator: (accountId: string) => Promise<boolean>;
}) {
  /**
   * The first account ever registered becomes the platform operator. Counted after the insert,
   * so the deployment's very first registration claims it; the unique index on the flag settles
   * two first registrations racing.
   */
  async function claimOperatorIfFirst(account: OrganizationAccount): Promise<void> {
    if ((await deps.countAccounts()) === 1) {
      await deps.claimPlatformOperator(account._id.toString());
    }
  }

  return async function planOrganizationRegistration(
    input: OrganizationRegistrationInput,
    email: string,
  ): Promise<OrganizationResult<OrganizationRegistration>> {
    if (input.organizationInvite != null && input.organizationInvite !== '') {
      const checked = await deps.invites.checkRegistrationInvite(input.organizationInvite, email);
      if (!checked.ok) {
        return checked;
      }
      const { invite } = checked.value;
      if (invite.kind === OrganizationInviteKind.EMAIL) {
        return {
          ok: true,
          value: {
            accountFields: { emailVerified: true },
            onAccountCreated: async (account) => {
              await claimOperatorIfFirst(account);
              const redeemed = await deps.invites.redeemInvite(account, invite);
              if (!redeemed.ok) {
                throw new Error(
                  `[registration] Invite could not be redeemed: ${redeemed.error.code}`,
                );
              }
            },
          },
        };
      }
      return {
        ok: true,
        value: {
          accountFields: { pendingInviteId: invite._id.toString() },
          onAccountCreated: claimOperatorIfFirst,
        },
      };
    }

    const name = parseOrganizationName(input.organization?.name);
    if (!name) {
      return { ok: false, error: { code: OrganizationErrorCode.ORG_NAME_INVALID, status: 400 } };
    }
    return {
      ok: true,
      value: {
        accountFields: { pendingOrganization: { name } },
        onAccountCreated: claimOperatorIfFirst,
      },
    };
  };
}

export type PlanOrganizationRegistration = ReturnType<typeof createRegistrationPlanner>;

type RegistrationRequest = Request<
  Record<string, string>,
  unknown,
  { email?: unknown; organizationInvite?: unknown } | undefined
> & { organizationInvite?: true };

/**
 * Registration middleware: a valid organization invite admits a registration even where open
 * registration is off, as a platform invite does. An invalid one is refused with its code
 * before any account work; `registerUser` checks it again authoritatively.
 */
export function createRegistrationInviteCheck(deps: {
  invites: Pick<InviteService, 'checkRegistrationInvite'>;
}) {
  return async (req: RegistrationRequest, res: Response, next: NextFunction): Promise<void> => {
    const token = req.body?.organizationInvite;
    if (!isOrganizationsEnabled() || token == null || token === '') {
      next();
      return;
    }
    try {
      const email = typeof req.body?.email === 'string' ? req.body.email : '';
      const checked = await deps.invites.checkRegistrationInvite(token, email);
      if (!checked.ok) {
        res.status(checked.error.status).json({ code: checked.error.code });
        return;
      }
      req.organizationInvite = true;
      next();
    } catch (error) {
      next(error);
    }
  };
}
