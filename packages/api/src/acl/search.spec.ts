import { logger } from '@librechat/data-schemas';
import { Permissions, SystemRoles, PrincipalType, PermissionTypes } from 'librechat-data-provider';
import type { Response } from 'express';
import type { PrincipalSearchRequest, SearchablePrincipalType } from './search';
import {
  createPeoplePickerAccess,
  getRequestedPrincipalTypes,
  getEntraPrincipalSearchType,
} from './search';

type PickerPermissions = {
  [Permissions.VIEW_USERS]?: boolean;
  [Permissions.VIEW_GROUPS]?: boolean;
  [Permissions.VIEW_ROLES]?: boolean;
};

type Query = PrincipalSearchRequest['query'];

const { USER, GROUP, ROLE } = PrincipalType;

const permissionsFor = (types: SearchablePrincipalType[]): PickerPermissions => ({
  [Permissions.VIEW_USERS]: types.includes(USER),
  [Permissions.VIEW_GROUPS]: types.includes(GROUP),
  [Permissions.VIEW_ROLES]: types.includes(ROLE),
});

const setup = ({
  query = {},
  role = SystemRoles.USER,
  picker,
  getRoleByName = jest.fn(async () => ({
    permissions: picker ? { [PermissionTypes.PEOPLE_PICKER]: picker } : {},
  })),
}: {
  query?: Query;
  role?: string | null;
  picker?: PickerPermissions;
  getRoleByName?: jest.Mock;
}) => {
  const req = { user: role ? { id: 'user123', role } : undefined, query } as PrincipalSearchRequest;
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  const middleware = createPeoplePickerAccess({ getRoleByName });
  return {
    req,
    res,
    next,
    getRoleByName,
    run: () => middleware(req, res as unknown as Response, next),
  };
};

const outcomeOf = ({ req, res, next }: ReturnType<typeof setup>) => ({
  status: res.status.mock.calls[0]?.[0],
  body: res.json.mock.calls[0]?.[0],
  nextCalls: next.mock.calls.length,
  types: req.principalSearchTypes,
});

const forbidden = (message: string) => ({
  status: 403,
  body: { error: 'Forbidden', message },
  nextCalls: 0,
  types: undefined,
});

const allowed = (types: SearchablePrincipalType[]) => ({
  status: undefined,
  body: undefined,
  nextCalls: 1,
  types,
});

describe('getRequestedPrincipalTypes', () => {
  it.each([
    [{}, []],
    [{ type: GROUP }, [GROUP]],
    [{ types: `${USER},${ROLE}` }, [USER, ROLE]],
    [{ types: [GROUP, `${ROLE},${USER}`] }, [GROUP, ROLE, USER]],
    [{ type: USER, types: `${GROUP},${USER}` }, [USER, GROUP]],
    [{ types: `${PrincipalType.PUBLIC},foobar,` }, []],
    [{ types: { nested: USER } }, []],
    [{ type: [{ nested: USER }] }, []],
  ])('reads %j as %j', (query, expected) => {
    expect(getRequestedPrincipalTypes(query)).toEqual(expected);
  });
});

describe('getEntraPrincipalSearchType', () => {
  it.each([
    [[USER, GROUP, ROLE], 'all'],
    [[USER, GROUP], 'all'],
    [[USER, ROLE], 'users'],
    [[USER], 'users'],
    [[GROUP, ROLE], 'groups'],
    [[GROUP], 'groups'],
    [[ROLE], null],
    [[], null],
  ])('maps %j to %s', (types, expected) => {
    expect(getEntraPrincipalSearchType(types as SearchablePrincipalType[])).toBe(expected);
  });
});

describe('createPeoplePickerAccess', () => {
  it('returns 401 if user is not authenticated', async () => {
    const test = setup({ role: null });
    await test.run();

    expect(test.res.status).toHaveBeenCalledWith(401);
    expect(test.res.json).toHaveBeenCalledWith({
      error: 'Unauthorized',
      message: 'Authentication required',
    });
    expect(test.next).not.toHaveBeenCalled();
  });

  it('returns 403 if role has no permissions', async () => {
    const test = setup({ getRoleByName: jest.fn(async () => null) });
    await test.run();

    expect(outcomeOf(test)).toEqual(forbidden('No permissions configured for user role'));
  });

  it('allows a literal admin every type without loading the role', async () => {
    const test = setup({ role: SystemRoles.ADMIN });
    await test.run();

    expect(outcomeOf(test)).toEqual(allowed([USER, GROUP, ROLE]));
    expect(test.getRoleByName).not.toHaveBeenCalled();
  });

  it('narrows a literal admin search to the requested types', async () => {
    const test = setup({ role: SystemRoles.ADMIN, query: { type: GROUP } });
    await test.run();

    expect(outcomeOf(test)).toEqual(allowed([GROUP]));
  });

  it.each<[Query, SearchablePrincipalType[], SearchablePrincipalType[]]>([
    [{ type: USER }, [USER], [USER]],
    [{ type: GROUP }, [GROUP], [GROUP]],
    [{ type: ROLE }, [ROLE], [ROLE]],
    [{ types: `${USER},${GROUP}` }, [USER, GROUP], [USER, GROUP]],
    [{ types: GROUP }, [GROUP, ROLE], [GROUP]],
  ])('allows %j for a role permitting %j', async (query, permitted, expected) => {
    const test = setup({ query, picker: permissionsFor(permitted) });
    await test.run();

    expect(outcomeOf(test)).toEqual(allowed(expected));
  });

  it.each<[Query, SearchablePrincipalType[], string]>([
    [{ type: USER }, [GROUP, ROLE], 'users'],
    [{ type: GROUP }, [USER, ROLE], 'groups'],
    [{ type: ROLE }, [USER, GROUP], 'roles'],
    [{ types: GROUP }, [USER], 'groups'],
    [{ types: `${USER},${ROLE}` }, [USER], 'roles'],
    [{ types: [GROUP, ROLE] }, [USER, ROLE], 'groups'],
    [{ type: USER, types: GROUP }, [USER], 'groups'],
    [{ type: USER }, [], 'users'],
  ])('denies %j for a role permitting %j', async (query, permitted, label) => {
    const test = setup({ query, picker: permissionsFor(permitted) });
    await test.run();

    expect(outcomeOf(test)).toEqual(forbidden(`Insufficient permissions to search for ${label}`));
  });

  it.each<[Query, SearchablePrincipalType[]]>([
    [{}, [GROUP]],
    [{}, [ROLE]],
    [{}, [USER, ROLE]],
    [{}, [USER, GROUP, ROLE]],
    [{ types: '' }, [GROUP]],
    [{ types: 'foobar' }, [USER]],
    [{ types: PrincipalType.PUBLIC }, [GROUP, ROLE]],
    [{ types: { nested: USER } }, [GROUP]],
  ])(
    'limits an unfiltered search %j to the %j types the role permits',
    async (query, permitted) => {
      const test = setup({ query, picker: permissionsFor(permitted) });
      await test.run();

      expect(outcomeOf(test)).toEqual(allowed(permitted));
    },
  );

  it.each([{}, { types: '' }, { types: 'foobar' }])(
    'denies an unfiltered search %j when the role permits no types',
    async (query) => {
      const test = setup({ query, picker: permissionsFor([]) });
      await test.run();

      expect(outcomeOf(test)).toEqual(
        forbidden('Insufficient permissions to search for users, groups, or roles'),
      );
    },
  );

  it('denies a requested type when the role has no people picker permissions', async () => {
    const test = setup({ query: { type: USER } });
    await test.run();

    expect(outcomeOf(test)).toEqual(forbidden('Insufficient permissions to search for users'));
  });

  it('handles errors gracefully', async () => {
    const error = new Error('Database error');
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => logger);
    const test = setup({ getRoleByName: jest.fn().mockRejectedValue(error) });
    await test.run();

    expect(errorSpy).toHaveBeenCalledWith(
      '[checkPeoplePickerAccess][user123] error for type=undefined, types=undefined',
      error,
    );
    expect(test.res.status).toHaveBeenCalledWith(500);
    expect(test.res.json).toHaveBeenCalledWith({
      error: 'Internal Server Error',
      message: 'Failed to check permissions',
    });
    expect(test.next).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
