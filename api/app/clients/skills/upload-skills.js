#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * One-off CLI: zips and uploads each custom skill in this directory to
 * Anthropic's Skills API, then writes the resulting skill_ids to
 * registry.json so AnthropicClient can reference them at runtime.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... node api/app/clients/skills/upload-skills.js
 *
 * Re-running uploads new versions of any skill whose contents have changed
 * (Anthropic versions skills automatically; we always reference "latest").
 *
 * Each skill is a sibling directory containing a SKILL.md plus optional
 * supporting files. The directory name is used as the local "slug" key in
 * registry.json; the skill's display_title comes from SKILL.md frontmatter
 * if present, else falls back to the directory name.
 */

const fs = require('fs');
const path = require('path');

const SKILLS_DIR = __dirname;
const REGISTRY_FILE = path.join(SKILLS_DIR, 'registry.json');
const ANTHROPIC_API = 'https://api.anthropic.com/v1/skills';
const ANTHROPIC_VERSION = '2023-06-01';
const SKILLS_BETA = 'skills-2025-10-02';

function findSkillDirectories() {
  return fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(SKILLS_DIR, d.name))
    .filter((dir) => fs.existsSync(path.join(dir, 'SKILL.md')));
}

function listFiles(rootDir) {
  /** @type {string[]} absolute paths to every file under rootDir */
  const out = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        out.push(full);
      }
    }
  }
  walk(rootDir);
  return out;
}

function parseFrontmatterField(skillMdContent, field) {
  const match = skillMdContent.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return null;
  const body = match[1];
  const re = new RegExp(`^${field}:\\s*(.*)$`, 'm');
  const found = body.match(re);
  return found ? found[1].trim() : null;
}

function inferDisplayTitle(skillDir, skillMdPath) {
  const content = fs.readFileSync(skillMdPath, 'utf8');
  const fromFrontmatter = parseFrontmatterField(content, 'name');
  if (fromFrontmatter) return fromFrontmatter;
  return path.basename(skillDir);
}

function mimeTypeFor(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.md') return 'text/markdown';
  if (ext === '.txt') return 'text/plain';
  if (ext === '.py') return 'text/x-python';
  if (ext === '.json') return 'application/json';
  return 'application/octet-stream';
}

async function uploadSkill(apiKey, skillDir, existingSkillId) {
  const skillSlug = path.basename(skillDir);
  const skillMdPath = path.join(skillDir, 'SKILL.md');
  const displayTitle = inferDisplayTitle(skillDir, skillMdPath);

  const form = new FormData();
  /* display_title is only valid on the create endpoint — on the version
   * endpoint it'll be rejected (the title is fixed at skill creation). */
  if (!existingSkillId) {
    form.append('display_title', displayTitle);
  }

  const files = listFiles(skillDir);
  for (const filePath of files) {
    const relativeName = path.relative(path.dirname(skillDir), filePath);
    /* Anthropic expects file paths relative to the skill root, prefixed with
     * the skill directory name (matching the example `financial_skill/SKILL.md`). */
    const fileBuffer = fs.readFileSync(filePath);
    const blob = new Blob([fileBuffer], { type: mimeTypeFor(filePath) });
    form.append('files[]', blob, relativeName);
  }

  const url = existingSkillId
    ? `${ANTHROPIC_API}/${encodeURIComponent(existingSkillId)}/versions`
    : ANTHROPIC_API;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'anthropic-beta': SKILLS_BETA,
    },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Upload failed for "${skillSlug}" (${res.status}): ${body.slice(0, 500)}`);
  }

  const data = await res.json();
  /* Create returns { id, display_title, latest_version, ... };
   * versions endpoint returns just the version metadata, so reuse the
   * existing skill_id we passed in. */
  return {
    slug: skillSlug,
    skill_id: existingSkillId ?? data.id,
    display_title: data.display_title ?? displayTitle,
    latest_version: data.latest_version ?? data.version ?? null,
    created_at: data.created_at ?? null,
    file_count: files.length,
    is_new: !existingSkillId,
  };
}

function loadRegistry() {
  if (!fs.existsSync(REGISTRY_FILE)) {
    return { skills: {} };
  }
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'));
  } catch (error) {
    console.warn(`[skills] could not parse existing registry: ${error.message}`);
    return { skills: {} };
  }
}

function saveRegistry(registry) {
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2) + '\n');
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'user_provided') {
    console.error('ANTHROPIC_API_KEY env var is required (a real key, not "user_provided").');
    process.exit(1);
  }

  const skills = findSkillDirectories();
  if (skills.length === 0) {
    console.log(`No skills found in ${SKILLS_DIR}. Add a subdirectory with a SKILL.md.`);
    return;
  }

  console.log(`Found ${skills.length} skill(s) to upload:`);
  for (const dir of skills) {
    console.log(`  - ${path.basename(dir)}`);
  }

  const registry = loadRegistry();
  for (const dir of skills) {
    const slug = path.basename(dir);
    const existingSkillId = registry.skills?.[slug]?.skill_id;
    const action = existingSkillId ? 'new version of' : 'new skill';
    process.stdout.write(`Uploading ${action} ${slug}… `);
    try {
      const result = await uploadSkill(apiKey, dir, existingSkillId);
      registry.skills[slug] = {
        skill_id: result.skill_id,
        display_title: result.display_title,
        latest_version: result.latest_version,
        last_uploaded_at: new Date().toISOString(),
        file_count: result.file_count,
      };
      console.log(`ok → ${result.skill_id} v${result.latest_version ?? '?'} (${result.file_count} file(s))`);
    } catch (error) {
      console.log('failed');
      console.error(`  ${error.message}`);
      registry.skills[slug] = registry.skills[slug] ?? {};
      registry.skills[slug].last_error = error.message;
      registry.skills[slug].last_attempted_at = new Date().toISOString();
    }
  }

  saveRegistry(registry);
  console.log(`\nRegistry written to ${REGISTRY_FILE}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
