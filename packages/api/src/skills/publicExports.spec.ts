import { createRequire } from 'node:module';

it('exports Skill upload helpers from the built public API', () => {
  const api = createRequire(__filename)('@librechat/api') as typeof import('../index');
  expect(typeof api.withSkillUploadIntent).toBe('function');
  expect(typeof api.reserveSkillBlob).toBe('function');
  expect(typeof api.createSkillBlobReserver).toBe('function');
  expect(typeof api.createSkillStorageResolver).toBe('function');
  expect(typeof api.createSkillBufferWriter).toBe('function');
});
