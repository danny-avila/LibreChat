import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { createMagicLinkHandlers } from './magiclink';
import type { IMagicLink } from '@librechat/data-schemas';

jest.mock('@librechat/data-schemas', () => ({
  hashToken: jest.fn((s: string) => Promise.resolve(`hash:${s}`)),
  getRandomValues: jest.fn(() => Promise.resolve('randomhex')),
  logger: { error: jest.fn(), debug: jest.fn() },
}));

function makeLink(overrides: Partial<IMagicLink> = {}): IMagicLink {
  return {
    _id: new Types.ObjectId(),
    token: 'hash:randomhex',
    email: 'student@test.com',
    createdBy: new Types.ObjectId(),
    active: true,
    useCount: 0,
    createdAt: new Date(),
    ...overrides,
  } as unknown as IMagicLink;
}

function makeRes(): Partial<Response> {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
}

function makeReq(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    user: { _id: new Types.ObjectId() },
    body: {},
    params: {},
    ...overrides,
  };
}

describe('createMagicLinkHandlers', () => {
  const adminId = new Types.ObjectId();

  describe('generate', () => {
    it('returns 400 when email is missing', async () => {
      const deps = {
        createMagicLink: jest.fn(),
        findMagicLink: jest.fn(),
        findMagicLinkById: jest.fn(),
        updateMagicLink: jest.fn(),
        listMagicLinks: jest.fn(),
      };
      const { generate } = createMagicLinkHandlers(deps);
      const req = makeReq({ user: { _id: adminId }, body: {} });
      const res = makeRes();
      await generate(req as Request, res as Response);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 when email format is invalid', async () => {
      const deps = {
        createMagicLink: jest.fn(),
        findMagicLink: jest.fn(),
        findMagicLinkById: jest.fn(),
        updateMagicLink: jest.fn(),
        listMagicLinks: jest.fn(),
      };
      const { generate } = createMagicLinkHandlers(deps);
      const req = makeReq({ user: { _id: adminId }, body: { email: 'notanemail' } });
      const res = makeRes();
      await generate(req as Request, res as Response);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 409 when active link already exists for email', async () => {
      const deps = {
        createMagicLink: jest.fn(),
        findMagicLink: jest.fn().mockResolvedValue(makeLink()),
        findMagicLinkById: jest.fn(),
        updateMagicLink: jest.fn(),
        listMagicLinks: jest.fn(),
      };
      const { generate } = createMagicLinkHandlers(deps);
      const req = makeReq({ user: { _id: adminId }, body: { email: 'student@test.com' } });
      const res = makeRes();
      await generate(req as Request, res as Response);
      expect(res.status).toHaveBeenCalledWith(409);
    });

    it('creates link and returns 201 with url when email is new', async () => {
      const link = makeLink();
      const deps = {
        createMagicLink: jest.fn().mockResolvedValue(link),
        findMagicLink: jest.fn().mockResolvedValue(null),
        findMagicLinkById: jest.fn(),
        updateMagicLink: jest.fn(),
        listMagicLinks: jest.fn(),
      };
      const { generate } = createMagicLinkHandlers(deps);
      const req = makeReq({ user: { _id: adminId }, body: { email: 'student@test.com' } });
      const res = makeRes();
      await generate(req as Request, res as Response);
      expect(res.status).toHaveBeenCalledWith(201);
      expect((res.json as jest.Mock).mock.calls[0][0]).toHaveProperty('url');
    });
  });

  describe('revoke', () => {
    it('returns 404 when link not found', async () => {
      const deps = {
        createMagicLink: jest.fn(),
        findMagicLink: jest.fn(),
        findMagicLinkById: jest.fn().mockResolvedValue(null),
        updateMagicLink: jest.fn(),
        listMagicLinks: jest.fn(),
      };
      const { revoke } = createMagicLinkHandlers(deps);
      const req = makeReq({ params: { id: 'nonexistent' } });
      const res = makeRes();
      await revoke(req as Request, res as Response);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('sets active=false and returns 204 when link exists', async () => {
      const link = makeLink();
      const deps = {
        createMagicLink: jest.fn(),
        findMagicLink: jest.fn(),
        findMagicLinkById: jest.fn().mockResolvedValue(link),
        updateMagicLink: jest.fn().mockResolvedValue({ ...link, active: false }),
        listMagicLinks: jest.fn(),
      };
      const { revoke } = createMagicLinkHandlers(deps);
      const req = makeReq({ params: { id: link._id.toString() } });
      const res = makeRes();
      await revoke(req as Request, res as Response);
      expect(deps.updateMagicLink).toHaveBeenCalledWith(link._id.toString(), { active: false });
      expect(res.status).toHaveBeenCalledWith(204);
    });
  });

  describe('list', () => {
    it('returns all links for the requesting admin', async () => {
      const links = [makeLink(), makeLink({ email: 'other@test.com' })];
      const deps = {
        createMagicLink: jest.fn(),
        findMagicLink: jest.fn(),
        findMagicLinkById: jest.fn(),
        updateMagicLink: jest.fn(),
        listMagicLinks: jest.fn().mockResolvedValue(links),
      };
      const { list } = createMagicLinkHandlers(deps);
      const req = makeReq({ user: { _id: adminId } });
      const res = makeRes();
      await list(req as Request, res as Response);
      expect(deps.listMagicLinks).toHaveBeenCalledWith({ createdBy: adminId });
      expect((res.json as jest.Mock).mock.calls[0][0]).toHaveLength(2);
    });
  });
});
