const fs = require('fs');
const path = require('path');

const read = (relativePath) => fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');

describe('storage quota write boundaries', () => {
  it('keeps core File writes behind the package quota seam', () => {
    const source = read('./process.js');
    expect(source).not.toMatch(/db\.createFile\(/);
    expect(source).toContain('createFileQuotaPersistence({');
    expect(source).toContain('createFile: db.createFile');
  });

  it('keeps Code output row commits inside the quota callback', () => {
    const source = read('./Code/process.js');
    expect(source).not.toMatch(/\bcreateFile\(/);
    expect(source).toContain('const persistCodeFile = createFileQuotaCommitter({');
    expect(source).toContain('await persistCodeFile(');
    expect(source).toContain("? { 'metadata.outputClaimRevision': outputClaimRevision }");
    expect(source).toContain('updateFile(');
  });

  it('keeps server SkillFile writes behind the shared quota service', () => {
    const routes = read('../../routes/skills.js');
    const skillDeps = read('../Endpoints/agents/skillDeps.js');
    const sync = read('../Skills/sync.js');
    expect(routes).not.toMatch(/\bupsertSkillFile\s*\(/);
    expect(skillDeps).not.toMatch(/db\.upsertSkillFile\s*\(/);
    expect(sync).not.toMatch(/upsertSkillFile:\s*db\.upsertSkillFile/);
  });
});
