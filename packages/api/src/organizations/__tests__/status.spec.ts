import { createOrganizationStatusCache } from '../status';

describe('createOrganizationStatusCache', () => {
  it('reads once per TTL, shares a read in flight, and forgets on evict', async () => {
    let clock = 0;
    const findOrganization = jest.fn(async () => ({ status: 'suspended' as const }));
    const cache = createOrganizationStatusCache({
      findOrganization,
      ttlMs: 1000,
      now: () => clock,
    });

    const [first, second] = await Promise.all([cache.getStatus('org_a'), cache.getStatus('org_a')]);
    expect([first, second]).toEqual(['suspended', 'suspended']);
    expect(findOrganization).toHaveBeenCalledTimes(1);

    clock = 999;
    await cache.getStatus('org_a');
    expect(findOrganization).toHaveBeenCalledTimes(1);

    clock = 1000;
    await cache.getStatus('org_a');
    expect(findOrganization).toHaveBeenCalledTimes(2);

    cache.evict('org_a');
    await cache.getStatus('org_a');
    expect(findOrganization).toHaveBeenCalledTimes(3);
  });

  it('reports a missing organization as null and an unset status as active', async () => {
    const findOrganization = jest.fn(async (tenantId: string) =>
      tenantId === 'org_known' ? {} : null,
    );
    const cache = createOrganizationStatusCache({ findOrganization });

    await expect(cache.getStatus('org_known')).resolves.toBe('active');
    await expect(cache.getStatus('org_gone')).resolves.toBeNull();
  });

  it('does not cache a failed read', async () => {
    const findOrganization = jest
      .fn()
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValueOnce({ status: 'active' });
    const cache = createOrganizationStatusCache({ findOrganization });

    await expect(cache.getStatus('org_a')).rejects.toThrow('database unavailable');
    await expect(cache.getStatus('org_a')).resolves.toBe('active');
  });
});
