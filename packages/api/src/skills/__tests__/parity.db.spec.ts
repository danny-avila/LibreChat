import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  logger,
  createModels,
  createMethods,
  pickValidFrontmatter,
  type AllMethods,
} from '@librechat/data-schemas';
import { parseSkillMarkdown, toCleanFrontmatter } from '../parse';

logger.silent = true;

/**
 * The invariant this PR rests on: the same SKILL.md text must produce the same
 * invocation-mode columns whether it arrives as an upload or is pasted into the
 * skill editor. Those two routes read frontmatter differently — the upload path
 * runs js-yaml (`parseSkillMarkdown`), while a body-only save is read by the
 * line scanner inside `createSkill` — so nothing but a shared corpus keeps them
 * from drifting apart on the next change.
 *
 * Each row is fed through both routes and the resulting columns compared. Add a
 * row here for any frontmatter shape a bug report turns up.
 */

type Columns = {
  alwaysApply?: boolean;
  userInvocable?: boolean;
  disableModelInvocation?: boolean;
  rejected?: true;
};

let mongoServer: MongoMemoryServer;
let methods: AllMethods;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  createModels(mongoose);
  methods = createMethods(mongoose);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

const DESCRIPTION = 'A skill used by the frontmatter parity corpus.';

function bodyFor(name: string, frontmatterLines: string): string {
  return `---\nname: ${name}\ndescription: ${DESCRIPTION}\n${frontmatterLines}\n---\n\nBody.`;
}

function columnsOf(skill: {
  alwaysApply?: boolean;
  userInvocable?: boolean;
  disableModelInvocation?: boolean;
}): Columns {
  return {
    alwaysApply: skill.alwaysApply,
    userInvocable: skill.userInvocable,
    disableModelInvocation: skill.disableModelInvocation,
  };
}

/** The upload route: js-yaml parse, cleaned bag, then `createSkill`. */
async function viaImport(name: string, body: string): Promise<Columns> {
  const parsed = parseSkillMarkdown(body);
  if (parsed.parseError || parsed.invalidBooleans.length > 0) {
    return { rejected: true };
  }
  const { skill } = await methods.createSkill({
    name: `${name}-import`,
    description: DESCRIPTION,
    body,
    frontmatter: pickValidFrontmatter(toCleanFrontmatter(parsed)),
    alwaysApply: parsed.alwaysApply,
    author: new Types.ObjectId(),
    authorName: 'Parity',
  });
  return columnsOf(skill);
}

/** The editor route: body only, read by the body scanner inside `createSkill`. */
async function viaInlineBody(name: string, body: string): Promise<Columns> {
  try {
    const { skill } = await methods.createSkill({
      name: `${name}-inline`,
      description: DESCRIPTION,
      body,
      author: new Types.ObjectId(),
      authorName: 'Parity',
    });
    return columnsOf(skill);
  } catch {
    return { rejected: true };
  }
}

const CORPUS: Array<[label: string, frontmatterLines: string]> = [
  ['plain booleans', 'user-invocable: false\ndisable-model-invocation: true'],
  ['double-quoted value', 'user-invocable: "false"'],
  ['single-quoted value', "user-invocable: 'false'"],
  ['inline comment', 'user-invocable: false # off'],
  ['quoted value with comment', 'user-invocable: "false" # off'],
  ['comment-only value', 'user-invocable: # todo'],
  ['empty value', 'user-invocable:'],
  ['value on the next line', 'user-invocable:\n  false'],
  ['uppercase key and value', 'USER-INVOCABLE: FALSE'],
  ['spaces before the colon', 'user-invocable   : false'],
  ['trailing spaces after the value', 'user-invocable: false   '],
  ['double-quoted key', '"user-invocable": false'],
  ['single-quoted key', "'user-invocable': false"],
  ['empty quoted value', 'user-invocable: ""'],
  [
    'nested duplicate before the real key',
    'metadata:\n  user-invocable: nonsense\nuser-invocable: false',
  ],
  ['nested key only', 'metadata:\n  user-invocable: false'],
  ['flow-style nested mapping', 'metadata: {user-invocable: nonsense}'],
  ['multi-line plain scalar', 'user-invocable:\n  false\n  extra'],
  ['always-apply alias', 'alwaysApply: true'],
  ['both always-apply spellings', 'always-apply: false\nalwaysApply: true'],
  ['always-apply on the next line', 'always-apply:\n  true'],
  ['all three flags', 'always-apply: true\nuser-invocable: false\ndisable-model-invocation: true'],
  ['carriage return after the value', 'user-invocable: false\r'],
];

describe('frontmatter parity between the upload and inline-body routes', () => {
  let index = 0;

  it.each(CORPUS)('%s', async (_label, frontmatterLines) => {
    const name = `parity-${index++}`;
    const body = bodyFor(name, frontmatterLines);

    expect(await viaInlineBody(name, body)).toEqual(await viaImport(name, body));
  });

  it('rejects YAML the editor route tolerates, without setting a column either way', async () => {
    /* Tabs are illegal for YAML indentation, so js-yaml refuses the file and the
       upload is rejected outright, while the line scanner simply sees nothing at
       the mapping's indent and saves the text as authored. The asymmetry is in
       the rejection, never in the columns — neither route sets a flag — and it
       predates this work, since only the upload route ever parsed YAML. */
    const name = 'parity-tab-indent';
    const body = bodyFor(name, 'metadata:\n\tuser-invocable: false');

    expect(await viaImport(name, body)).toEqual({ rejected: true });
    expect(await viaInlineBody(name, body)).toMatchObject({
      userInvocable: true,
      disableModelInvocation: false,
    });
  });

  it('documents the one shape the two routes read differently', async () => {
    /* Duplicate keys differing only in case: js-yaml keeps the last after the
       keys normalize to one, the line scanner takes the first. The file is
       ambiguous by construction and neither reading can release a restriction,
       so this is pinned rather than fixed — widening the line scanner into a
       second YAML implementation would cost more than it buys. */
    const name = 'parity-case-duplicate';
    const body = bodyFor(name, 'user-invocable: false\nUSER-INVOCABLE: true');

    expect(await viaImport(name, body)).toMatchObject({ userInvocable: true });
    expect(await viaInlineBody(name, body)).toMatchObject({ userInvocable: false });
  });
});
