jest.mock('@librechat/data-schemas', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

import { fetchTarsDomainById, fetchTarsDomainsForUser } from './domains';
import type { TarsDomain } from './domains';

const BASE_URL = 'http://tars.test';

const buildResponse = (status: number, body: unknown): Response =>
  ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  }) as Response;

const domain = (id: number, name: string): TarsDomain => ({
  id,
  name,
  description: `${name} description`,
  role_ids: '1,2',
  knowledge_base_ids: 'kb-1',
  domain_functions: '{}',
  status: true,
});

describe('fetchTarsDomainsForUser', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns [] without calling pwc_tars when tarsId is missing', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    await expect(fetchTarsDomainsForUser('', BASE_URL)).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requests get_domain_by_user with the user id and returns sys_domains', async () => {
    const domains = [domain(1, 'Finance'), domain(2, 'HR')];
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(buildResponse(200, { sys_domains: domains }));

    const result = await fetchTarsDomainsForUser('u1', BASE_URL);

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/api/domain_settings/get_domain_by_user?user_id=u1`,
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result).toEqual(domains);
  });

  it('defaults to [] when the response omits sys_domains', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(buildResponse(200, {}));
    await expect(fetchTarsDomainsForUser('u1', BASE_URL)).resolves.toEqual([]);
  });

  it('throws when no base URL is configured', async () => {
    await expect(fetchTarsDomainsForUser('u1', undefined)).rejects.toThrow('TARS_AUTH_URL');
  });

  it('throws on a non-2xx pwc_tars response', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(buildResponse(500, {}));
    await expect(fetchTarsDomainsForUser('u1', BASE_URL)).rejects.toThrow('status 500');
  });
});

describe('fetchTarsDomainById', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('resolves a domain the user is authorized for (numeric/string agnostic)', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        buildResponse(200, { sys_domains: [domain(1, 'Finance'), domain(2, 'HR')] }),
      );

    const result = await fetchTarsDomainById('u1', '2', BASE_URL);
    expect(result).toMatchObject({ id: 2, name: 'HR' });
  });

  it('returns null when the domain is outside the user grants', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(buildResponse(200, { sys_domains: [domain(1, 'Finance')] }));

    await expect(fetchTarsDomainById('u1', 999, BASE_URL)).resolves.toBeNull();
  });
});
