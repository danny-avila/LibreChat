import {
  withFileDeletion,
  withFileProvisioning,
  confirmFileProvision,
  FileProvisionPersistenceError,
} from './operations';

const file = { file_id: 'file', user: 'owner', tenantId: 'tenant' };
function setup() {
  const provisioners = new Set<string>();
  let deleting: string | undefined;
  let pending = false;
  const storage = {
    commitFileProvision: jest.fn().mockResolvedValue(true),
    acquireFileProvision: jest.fn(async ({ token }: { token: string }) => {
      if (pending || deleting) return false;
      provisioners.add(token);
      return true;
    }),
    releaseFileProvision: jest.fn(async ({ token }: { token: string }) =>
      provisioners.delete(token),
    ),
    acquireFileDeletion: jest.fn(async ({ token }: { token: string }) => {
      if (deleting || provisioners.size) return null;
      const resumed = pending;
      deleting = token;
      pending = true;
      return { resumed };
    }),
    releaseFileDeletion: jest.fn(
      async ({ token, retainDeletion }: { token: string; retainDeletion: boolean }) => {
        if (token !== deleting) return false;
        deleting = undefined;
        pending = retainDeletion;
        return true;
      },
    ),
  };
  return { storage, provisioners };
}

function barrier() {
  let release: () => void = () => undefined;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { wait, release };
}

it('blocks provisioning throughout primary I/O and after it until metadata finalizes', async () => {
  const { storage } = setup();
  const entered = barrier();
  const complete = barrier();
  const deletion = withFileDeletion({
    file,
    userId: 'caller',
    storage,
    operation: async (primaryDeleted) => {
      entered.release();
      await complete.wait;
      primaryDeleted();
    },
  });
  await entered.wait;
  const upload = jest.fn();
  await expect(
    withFileProvisioning({ file, userId: 'caller', storage, operation: upload }),
  ).rejects.toThrow('conflicts');
  complete.release();
  await deletion;
  await expect(
    withFileProvisioning({ file, userId: 'caller', storage, operation: upload }),
  ).rejects.toThrow('conflicts');
  expect(upload).not.toHaveBeenCalled();
});

it('keeps primary deletion out while an upload and its pointer persistence are pending', async () => {
  const { storage } = setup();
  const entered = barrier();
  const persisted = barrier();
  const provision = withFileProvisioning({
    file,
    userId: 'caller',
    storage,
    operation: async () => {
      entered.release();
      await persisted.wait;
    },
  });
  await entered.wait;
  const remove = jest.fn();
  await expect(
    withFileDeletion({ file, userId: 'caller', storage, operation: remove }),
  ).rejects.toThrow('conflicts');
  expect(remove).not.toHaveBeenCalled();
  persisted.release();
  await provision;
  await withFileDeletion({
    file,
    userId: 'caller',
    storage,
    operation: async (primaryDeleted) => primaryDeleted(),
  });
});

it('restores repair eligibility when deletion fails before primary removal', async () => {
  const { storage } = setup();
  await expect(
    withFileDeletion({
      file,
      userId: 'caller',
      storage,
      operation: async () => {
        throw new Error('secondary offline');
      },
    }),
  ).rejects.toThrow('secondary offline');
  const repair = jest.fn().mockResolvedValue('repaired');
  await expect(
    withFileProvisioning({ file, userId: 'caller', storage, operation: repair }),
  ).resolves.toBe('repaired');
});

it('does not reopen provisioning after a failed retry of an already-removed primary', async () => {
  const { storage } = setup();
  await withFileDeletion({
    file,
    userId: 'caller',
    storage,
    operation: async (primaryDeleted) => primaryDeleted(),
  });
  await expect(
    withFileDeletion({
      file,
      userId: 'caller',
      storage,
      operation: async () => {
        throw new Error('metadata offline');
      },
    }),
  ).rejects.toThrow('metadata offline');
  await expect(
    withFileProvisioning({ file, userId: 'caller', storage, operation: jest.fn() }),
  ).rejects.toThrow('conflicts');
});

it('releases a failed provisioning operation before a deletion can proceed', async () => {
  const { storage } = setup();
  await expect(
    withFileProvisioning({
      file,
      userId: 'caller',
      storage,
      operation: async () => {
        throw new Error('upload offline');
      },
    }),
  ).rejects.toThrow('upload offline');
  await withFileDeletion({ file, userId: 'caller', storage, operation: jest.fn() });
  expect(storage.releaseFileProvision).toHaveBeenCalledWith(
    expect.objectContaining({ userId: 'owner', tenantId: 'tenant' }),
  );
});

it('waits for every independent provisioning claim', async () => {
  const { storage, provisioners } = setup();
  const entered = barrier();
  const done = barrier();
  let started = 0;
  const operation = async () => {
    if (++started === 2) entered.release();
    await done.wait;
  };
  const uploads = [
    withFileProvisioning({ file, userId: 'caller', storage, operation }),
    withFileProvisioning({ file, userId: 'caller', storage, operation }),
  ];
  await entered.wait;
  expect(provisioners.size).toBe(2);
  await expect(
    withFileDeletion({ file, userId: 'caller', storage, operation: jest.fn() }),
  ).rejects.toThrow('conflicts');
  done.release();
  await Promise.all(uploads);
  expect(provisioners.size).toBe(0);
});

it('retains an unconfirmed remote copy claim instead of making primary deletion possible', async () => {
  const { storage, provisioners } = setup();
  storage.commitFileProvision.mockResolvedValue(false);
  await expect(
    withFileProvisioning({
      file,
      userId: 'caller',
      storage,
      operation: (claim) => confirmFileProvision(storage, { claim, embedded: true }),
    }),
  ).rejects.toBeInstanceOf(FileProvisionPersistenceError);
  expect(provisioners.size).toBe(1);
  expect(storage.releaseFileProvision).not.toHaveBeenCalled();
  await expect(
    withFileDeletion({ file, userId: 'caller', storage, operation: jest.fn() }),
  ).rejects.toThrow('conflicts');
});
