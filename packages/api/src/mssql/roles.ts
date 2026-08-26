import { logger } from '@librechat/data-schemas';
import { sapphireDbConfig } from './config';
import { getSapphirePool } from './pool';

/** Bracket-quoted schema from config (a trusted identifier, not user input). */
const quoteSqlIdent = (name: string) => `[${name.replace(/]/g, ']]')}]`;
const database = quoteSqlIdent(sapphireDbConfig.database);
const schema = quoteSqlIdent(sapphireDbConfig.schema);

/**
 * Sapphire users are matched to LibreChat users by the Azure AD object id (the
 * `oid` claim), stored on the LibreChat user as `idOnTheSource` and on the Sapphire
 * side as `UserLogins.ExternalID`. From that user, a role is held when it is
 * assigned either directly via UserAssmts or indirectly through a role group
 * (BSSUserRoleGrp -> RoleGrpAssmts); both queries below union those two paths.
 * `@roleId` matches the stable `Roles.RoleID` code. Matching is case-insensitive
 * because the database collation is CI_AS.
 * ${database} is used even though it's not necessary to future-proof in case we
 * eventually need to use another database.  It can be the case where we need to
 * join multiple databases.
 */
const HAS_ROLE_QUERY = `
select top 1 1 as [hasRole]
from ${database}.${schema}.[Roles]
join ${database}.${schema}.[UserAssmts] on [UserAssmts].[RoleRID] = [Roles].[RoleRID]
  and [UserAssmts].[Status] in ('New', 'Open')
join ${database}.${schema}.[UserLogins] on [UserLogins].[BSSUserRID] = [UserAssmts].[BSSUserRID]
  and [UserLogins].[Type] IN ('Office 365', 'SBOpenID', 'SBOpenID2')
  and [UserLogins].[Status] in ('New')
  and [UserLogins].[ExternalID] = @externalId
where [Roles].[Status] in ('New', 'Open', 'Active')
  and [Roles].[RoleID] = @roleId
union
select top 1 1 as [hasRole]
from ${database}.${schema}.[Roles]
join ${database}.${schema}.[RoleGrpAssmts] on [RoleGrpAssmts].[RoleRID] = [Roles].[RoleRID]
  and [RoleGrpAssmts].[Status] in ('New', 'Open')
join ${database}.${schema}.[RoleGrps] on [RoleGrps].[RoleGrpRID] = [RoleGrpAssmts].[RoleGrpRID]
  and [RoleGrps].[Status] in ('New', 'Open')
join ${database}.${schema}.[BSSUserRoleGrp] on [RoleGrpAssmts].[RoleGrpRID] = [BSSUserRoleGrp].[RoleGrpRID]
  and [BSSUserRoleGrp].[Status] in ('New', 'Open')
join ${database}.${schema}.[UserLogins] on [UserLogins].[BSSUserRID] = [BSSUserRoleGrp].[BSSUserRID]
  and [UserLogins].[Type] in ('Office 365', 'SBOpenID', 'SBOpenID2')
  and [UserLogins].[Status] in ('New')
  and [UserLogins].[ExternalID] = @externalId
where [Roles].[Status] in ('New', 'Open', 'Active')
  and [Roles].[RoleID] = @roleId;
`;

const USER_ROLES_QUERY = `
select [Roles].[RoleID], [Roles].[Name]
from ${database}.${schema}.[Roles]
join ${database}.${schema}.[UserAssmts] on [UserAssmts].[RoleRID] = [Roles].[RoleRID]
  and [UserAssmts].[Status] in ('New', 'Open')
join ${database}.${schema}.[UserLogins] on [UserLogins].[BSSUserRID] = [UserAssmts].[BSSUserRID]
  and [UserLogins].[Type] in ('Office 365', 'SBOpenID', 'SBOpenID2')
  and [UserLogins].[Status] in ('New')
  and [UserLogins].[ExternalID] = @externalId
where [Roles].[Status] in ('New', 'Open', 'Active')
union
select [Roles].[RoleID], [Roles].[Name]
from ${database}.${schema}.[Roles]
join ${database}.${schema}.[RoleGrpAssmts] on [RoleGrpAssmts].[RoleRID] = [Roles].[RoleRID]
  and [RoleGrpAssmts].[Status] in ('New', 'Open')
join ${database}.${schema}.[RoleGrps] on [RoleGrps].[RoleGrpRID] = [RoleGrpAssmts].[RoleGrpRID]
  and [RoleGrps].[Status] in ('New', 'Open')
join ${database}.${schema}.[BSSUserRoleGrp] on [RoleGrpAssmts].[RoleGrpRID] = [BSSUserRoleGrp].[RoleGrpRID]
  and [BSSUserRoleGrp].[Status] in ('New', 'Open')
join ${database}.${schema}.[UserLogins] on [UserLogins].[BSSUserRID] = [BSSUserRoleGrp].[BSSUserRID]
  and [UserLogins].[Type] in ('Office 365', 'SBOpenID', 'SBOpenID2')
  and [UserLogins].[Status] in ('New')
  and [UserLogins].[ExternalID] = @externalId
where [Roles].[Status] in ('New', 'Open', 'Active');
`;

/** A role assigned to a user: the stable code and its display name. */
export interface SapphireRole {
  id: string;
  name: string;
}

/**
 * Returns true if the Sapphire user identified by their Azure AD object id
 * (`externalId`, i.e. the LibreChat user's `idOnTheSource`) holds the given role
 * (by `Roles.RoleID` code), whether assigned directly or via a role group.
 * Returns false when unknown, unassigned, or on error.
 */
export const userHasRole = async (externalId: string, roleId: string): Promise<boolean> => {
  try {
    const pool = await getSapphirePool();
    const result = await pool
      .request()
      .input('externalId', externalId)
      .input('roleId', roleId)
      .query(HAS_ROLE_QUERY);
    return result.recordset.length > 0;
  } catch (err) {
    logger.error(`[sapphire] userHasRole failed for externalId '${externalId}'`, err);
    return false;
  }
};

/**
 * Returns the distinct set of roles assigned to the user (matched by Azure AD
 * object id), combining direct and role-group assignments. Prefer this over
 * repeated {@link userHasRole} calls when checking a user against several roles.
 * Returns an empty array on error or when the user is unknown.
 */
export const getUserRoles = async (externalId: string): Promise<SapphireRole[]> => {
  try {
    const pool = await getSapphirePool();
    const result = await pool
      .request()
      .input('externalId', externalId)
      .query<{ RoleID: string; Name: string }>(USER_ROLES_QUERY);
    return result.recordset.map((row) => ({ id: row.RoleID, name: row.Name }));
  } catch (err) {
    logger.error(`[sapphire] getUserRoles failed for externalId '${externalId}'`, err);
    return [];
  }
};
