import { FileContext } from 'librechat-data-provider';
import type { TFile } from 'librechat-data-provider';
import type { CodeFileAgent } from './queued';
import { planCodeFileUploads, prepareQueuedCodeFileContext } from './queued';

function file(id: string, overrides: Partial<TFile> = {}): TFile {
  return {
    file_id: id,
    filename: 'data.csv',
    filepath: '/uploads/data.csv',
    type: 'text/csv',
    user: 'user-1',
    object: 'file',
    bytes: 10,
    embedded: false,
    usage: 0,
    context: FileContext.message_attachment,
    ...overrides,
  };
}

function agent(id: string, files: TFile[]): CodeFileAgent {
  return {
    id,
    fileConsumers: { executeCode: true, fileSearch: false },
    provisionState: {
      codeEnvFiles: files,
      vectorDBFiles: [],
      aliveFileIds: new Set(),
      agentScopedFileIds: new Set(),
    },
    dynamicToolContextMap: {},
  };
}

describe('queued code-file destinations', () => {
  it('keeps an advertised shared path when a lazy agent adds a newer colliding input', () => {
    const shared = file('shared', { createdAt: '2026-09-01' });
    const parent = agent('parent', [{ ...shared }]);
    prepareQueuedCodeFileContext(parent, [parent], 'user-1');
    const advertised = parent.provisionState?.codeEnvDestinations?.get('shared');
    const child = agent('child', [{ ...shared }, file('new', { createdAt: '2026-10-01' })]);
    prepareQueuedCodeFileContext(child, [parent, child], 'user-1', true);

    expect(child.provisionState?.codeEnvDestinations?.get('shared')).toBe(advertised);
    expect(child.provisionState?.codeEnvDestinations?.get('new')).not.toBe(advertised);
    expect(
      planCodeFileUploads({
        context: child,
        contexts: [parent, child],
        agentId: child.id,
        userId: 'user-1',
        useAdvertisedNames: true,
      }).find((upload) => upload.file.file_id === 'shared')?.destination,
    ).toBe(advertised);
  });

  it('does not move a confirmed live path when another agent also queues that file', () => {
    const shared = file('shared', {
      createdAt: '2026-09-01',
      metadata: {
        codeEnvRefs: {
          default: {
            kind: 'user',
            id: 'user-1',
            storage_session_id: 'session',
            file_id: 'remote',
            sandboxFilename: 'data.csv',
          },
        },
      },
    });
    const parent = agent('parent', [file('new', { createdAt: '2026-10-01' })]);
    parent.tool_resources = { execute_code: { files: [shared] } };
    const child = agent('child', [{ ...shared }, file('new', { createdAt: '2026-10-01' })]);
    for (const current of [parent, child]) {
      prepareQueuedCodeFileContext(current, [parent, child], 'user-1');
    }

    expect(parent.provisionState?.codeEnvDestinations?.get('new')).not.toBe('data.csv');
    expect(child.provisionState?.codeEnvDestinations?.get('shared')).toBe('data.csv');
  });

  it('retains advertised paths after one file succeeds and another remains queued', () => {
    const current = agent('parent', [file('first'), file('second')]);
    prepareQueuedCodeFileContext(current, [current], 'user-1');
    const advertised = new Map(current.provisionState?.codeEnvDestinations);
    current.provisionState!.codeEnvFiles = [file('second')];
    current.pendingProvisionedCodeFiles = [
      {
        id: 'remote-first',
        name: advertised.get('first')!,
        storage_session_id: 'session',
        resource_id: 'user-1',
        kind: 'user',
      },
    ];
    prepareQueuedCodeFileContext(current, [current], 'user-1');

    expect(current.provisionState?.codeEnvDestinations?.get('second')).toBe(
      advertised.get('second'),
    );
  });

  it('keeps expired same-named project files from different chats in the upload plan', () => {
    const current = agent('parent', [
      file('own', { conversationId: 'current', createdAt: '2026-09-01' }),
      file('imported', { conversationId: 'other', createdAt: '2026-10-01' }),
    ]);
    current.provisionState!.project = {
      projectFileIds: new Set(['own', 'imported']),
      conversationId: 'current',
    };
    current.provisionState!.codeEnvRecoveryNames = new Map([
      ['own', { name: 'data.csv', isTargetScope: true }],
      ['imported', { name: 'data.csv', isTargetScope: true }],
    ]);
    prepareQueuedCodeFileContext(current, [current], 'user-1');
    const destinations = current.provisionState!.codeEnvDestinations!;
    expect(destinations.size).toBe(2);
    expect(destinations.get('own')).toBe('data.csv');
    expect(destinations.get('imported')).toMatch(/^data-.+\.csv$/);
    expect(current.provisionState!.temporaryCodeFileIds).toEqual(new Set(['imported']));
    expect(current.dynamicToolContextMap!.queued_code_files).toContain('(project file)');
  });

  it('still drops an expired superseded agent file in a project chat', () => {
    const current = agent('parent', [
      file('setup', { context: FileContext.agents, createdAt: '2026-09-01' }),
      file('output', {
        context: FileContext.execute_code,
        conversationId: 'current',
        createdAt: '2026-10-01',
      }),
    ]);
    current.provisionState!.project = {
      projectFileIds: new Set(['output', 'unrelated']),
      conversationId: 'current',
    };
    current.provisionState!.agentScopedFileIds = new Set(['setup']);
    current.provisionState!.codeEnvRecoveryNames = new Map([
      ['setup', { name: 'data.csv', isTargetScope: true }],
      ['output', { name: 'data.csv', isTargetScope: true }],
    ]);
    const uploads = planCodeFileUploads({
      context: current,
      contexts: [current],
      agentId: 'parent',
      userId: 'user-1',
    });
    expect(uploads.map((upload) => upload.file.file_id)).toEqual(['output']);
    expect(current.provisionState!.temporaryCodeFileIds!.size).toBe(0);
  });

  it('keeps the originating path when its file expires before a same-named import', () => {
    const current = agent('parent', [file('own', { conversationId: 'current' })]);
    const imported = file('imported', {
      conversationId: 'other',
      metadata: {
        codeEnvRefs: {
          default: {
            kind: 'user',
            id: 'user-1',
            storage_session_id: 'store',
            file_id: 'remote',
            sandboxFilename: 'data.csv',
          },
        },
      },
    });
    current.tool_resources = { execute_code: { files: [imported] } };
    current.provisionState!.project = {
      projectFileIds: new Set(['own', 'imported']),
      conversationId: 'current',
    };
    current.provisionState!.codeEnvRecoveryNames = new Map([
      ['own', { name: 'data.csv', isTargetScope: true }],
    ]);
    prepareQueuedCodeFileContext(current, [current], 'user-1');
    expect(current.provisionState!.codeEnvDestinations!.get('own')).toBe('data.csv');
    expect(current.provisionState!.codeEnvDestinations!.get('imported')).toMatch(/^data-.+\.csv$/);
    expect(current.provisionState!.codeEnvFiles.map((file) => file.file_id)).toContain('imported');
    expect(current.provisionState!.temporaryCodeFileIds).toEqual(new Set(['imported']));
  });

  it.each([false, true])(
    'stages imports across agents before planning an expired own file (second agent pending: %s)',
    (secondPending) => {
      const own = file('own', {
        conversationId: 'current',
        context: FileContext.execute_code,
        createdAt: '2026-09-01',
      });
      const imported = file('imported', {
        conversationId: 'other',
        context: FileContext.execute_code,
        createdAt: '2026-10-01',
        metadata: {
          codeEnvRefs: {
            default: {
              kind: 'user',
              id: 'user-1',
              storage_session_id: 'store',
              file_id: 'remote',
              sandboxFilename: 'data.csv',
            },
          },
        },
      });
      const first = agent('first', [{ ...own }]);
      const second = agent('second', secondPending ? [{ ...own }] : []);
      for (const current of [first, second]) {
        current.provisionState!.project = {
          projectFileIds: new Set(['own', 'imported']),
          conversationId: 'current',
        };
        current.provisionState!.codeEnvRecoveryNames = new Map([
          ['own', { name: 'data.csv', isTargetScope: true }],
        ]);
        current.tool_resources = { execute_code: { files: [{ ...imported }] } };
      }
      prepareQueuedCodeFileContext(first, [first, second], 'user-1');
      const firstPlan = new Map(first.provisionState!.codeEnvDestinations);
      expect(firstPlan.get('own')).toBe('data.csv');
      expect(firstPlan.get('imported')).toMatch(/^data-.+\.csv$/);
      expect(second.provisionState!.codeEnvFiles.map((entry) => entry.file_id)).toContain(
        'imported',
      );
      prepareQueuedCodeFileContext(second, [first, second], 'user-1');
      expect(first.provisionState!.codeEnvDestinations).toEqual(firstPlan);
      expect(second.provisionState!.codeEnvDestinations!.get('imported')).toBe(
        firstPlan.get('imported'),
      );
      if (secondPending) {
        expect(second.provisionState!.codeEnvDestinations!.get('own')).toBe('data.csv');
      }
      for (const current of [first, second]) {
        expect(current.provisionState!.temporaryCodeFileIds).toEqual(new Set(['imported']));
        expect(current.dynamicToolContextMap!.queued_code_files).toContain(
          firstPlan.get('imported'),
        );
        const uploads = planCodeFileUploads({
          context: current,
          contexts: [first, second],
          agentId: current.id,
          userId: 'user-1',
          useAdvertisedNames: true,
        });
        expect(uploads.find((upload) => upload.file.file_id === 'imported')?.destination).toBe(
          firstPlan.get('imported'),
        );
        expect(current.provisionState!.temporaryCodeFileIds).toEqual(new Set(['imported']));
      }
    },
  );
});
