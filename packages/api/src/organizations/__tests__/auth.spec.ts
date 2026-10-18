import { OrganizationErrorCode } from 'librechat-data-provider';
import type { Request, Response } from 'express';
import { requireOrganizationsEnabled } from '../auth';
import { configureOrganizations } from '../mode';

function createResponse() {
  const res = { statusCode: 200, body: undefined as unknown } as Response & { body: unknown };
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn((body: unknown) => {
    res.body = body;
    return res;
  });
  return res;
}

describe('organization mode gate', () => {
  const req = {} as Request;

  afterEach(() => {
    configureOrganizations(undefined);
  });

  describe('requireOrganizationsEnabled', () => {
    it('hides organization routes while organizations are off', () => {
      const res = createResponse();
      const next = jest.fn();

      requireOrganizationsEnabled(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual({ code: OrganizationErrorCode.ORGANIZATIONS_DISABLED });
    });

    it('lets organization routes through in organizations mode', () => {
      configureOrganizations({ enabled: true });
      const res = createResponse();
      const next = jest.fn();

      requireOrganizationsEnabled(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    });
  });
});
