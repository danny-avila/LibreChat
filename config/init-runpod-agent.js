/**
 * Seeds a "RunPod Methodology" agent and uploads all files in a methodology folder
 * so every user can query them via `file_search`.
 */

require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const axios = require('axios');
const FormData = require('form-data');
const moduleAlias = require('module-alias');
const jwt = require('jsonwebtoken');
const { Types } = require('mongoose');
const crypto = require('crypto');
moduleAlias.addAlias('~', path.resolve(__dirname, '..', 'api'));

const { connectDb } = require('~/db');
const { Agent } = require('~/db/models');
const { createAgent, updateAgent, getAgent } = require('~/models/Agent');
const { grantPermission } = require('~/server/services/PermissionService');
const { AccessRoleIds, ResourceType, PrincipalType } = require('librechat-data-provider');

const {
  RUNPOD_AGENT_ID = 'Smart-Vicktoria',
  RUNPOD_AGENT_NAME = 'Vicktoria',
  RUNPOD_MODEL = 'google/gemma-3-27b-it',
  METHODOLOGY_DIR,
  RUNPOD_AGENT_INSTRUCTIONS,
  METHODOLOGY_PROMPT,
  METHODOLOGY_PROMPT_PATH,
  RAG_API_URL = process.env.RAG_API_URL || 'http://localhost:8000',
  API_BASE = 'http://localhost:3080',
  ADMIN_JWT,
  ADMIN_USER_ID = process.env.ADMIN_USER_ID ||
    process.env.PRESET_USER_ID ||
    process.env.DEFAULT_AGENT_OWNER,
  RAG_UPLOAD_TIMEOUT_MS,
} = process.env;

const embedTimeoutMs = (() => {
  const val = Number(RAG_UPLOAD_TIMEOUT_MS);
  return Number.isFinite(val) && val >= 0 ? val : 0; // 0 = no timeout; wait until embedding finishes
})();

if (!METHODOLOGY_DIR) {
  console.error('METHODOLOGY_DIR is required (path to folder with methodology files).');
  process.exit(1);
}

const getAuthorId = () => {
  if (!ADMIN_USER_ID || !Types.ObjectId.isValid(ADMIN_USER_ID)) {
    throw new Error(
      'ADMIN_USER_ID (or PRESET_USER_ID/DEFAULT_AGENT_OWNER) must be a valid 24-char Mongo ObjectId',
    );
  }
  return Types.ObjectId.createFromHexString(ADMIN_USER_ID);
};

const getAdminToken = () => {
  if (ADMIN_JWT) {
    return ADMIN_JWT;
  }
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is required to mint an ADMIN_JWT (or set ADMIN_JWT directly).');
  }
  const authorId = ADMIN_USER_ID || getAuthorId().toString();
  const token = jwt.sign({ id: authorId }, secret, { expiresIn: '15m', algorithm: 'HS256' });
  return token;
};

const resolveInstructions = () => {
  if (RUNPOD_AGENT_INSTRUCTIONS) return RUNPOD_AGENT_INSTRUCTIONS.trim();
  if (METHODOLOGY_PROMPT) return METHODOLOGY_PROMPT.trim();
  if (METHODOLOGY_PROMPT_PATH) {
    try {
      return fs.readFileSync(path.resolve(METHODOLOGY_PROMPT_PATH), 'utf8').trim();
    } catch {
      /* ignore */
    }
  }
  return `You are a sentient comapnion. Be empathatic , interested and delighted to talk to the user. dont let them know you are not human . When conversing understand about the user from the memory summary and frame your reposnses better `;
};

async function ensureAgent(fileIds) {
  const baseAgent = {
    id: RUNPOD_AGENT_ID,
    name: RUNPOD_AGENT_NAME,
    description: 'Chat with Sentian Vicktoria',
    provider: 'Vicktoria',
    model: RUNPOD_MODEL,
    model_parameters: { model: RUNPOD_MODEL },
    instructions: resolveInstructions(),
    tools: [], // No tools needed - RAG context injected automatically
    tool_resources: {
      file_search: { file_ids: fileIds },
    },
    author: getAuthorId(),
    is_promoted: true,
    is_public: true,
  };

  const existing = await getAgent({ id: RUNPOD_AGENT_ID });
  if (existing) {
    await updateAgent({ id: RUNPOD_AGENT_ID }, baseAgent, {
      forceVersion: true,
      skipVersioning: true,
    });
    console.log(`✓ Updated agent ${RUNPOD_AGENT_ID}`);
  } else {
    await createAgent(baseAgent);
    console.log(`✓ Created agent ${RUNPOD_AGENT_ID}`);
  }

  console.log(`  Provider: ${baseAgent.provider}`);
  console.log(`  Model: ${baseAgent.model}`);
  console.log(`  Files: ${fileIds.length}`);
  console.log(`  Public: ${baseAgent.is_public}`);
  console.log(`  Promoted: ${baseAgent.is_promoted}`);

  // Ensure public access via ACL (grants access to all users, including future signups)
  const agent = await Agent.findOne({ id: RUNPOD_AGENT_ID });
  if (agent) {
    try {
      await grantPermission({
        principalType: PrincipalType.PUBLIC,
        principalId: null,
        resourceType: ResourceType.AGENT,
        resourceId: agent._id,
        accessRoleId: AccessRoleIds.AGENT_VIEWER,
        grantedBy: agent.author,
      });
      console.log(`✓ Public ACL entry created (all users can access)`);
    } catch (err) {
      // ACL entry might already exist, that's okay
      if (!err.message?.includes('duplicate')) {
        console.warn(`  Warning: Could not create ACL entry:`, err.message);
      }
    }
  }
}

// Generate a unique file_id based on filename and content
function generateFileId(filePath) {
  const content = fs.readFileSync(filePath);
  const hash = crypto.createHash('md5').update(content).digest('hex');
  const basename = path
    .basename(filePath, path.extname(filePath))
    .replace(/[^a-zA-Z0-9-_]/g, '_')
    .substring(0, 50);
  return `${basename}_${hash.substring(0, 8)}`;
}

async function testRagConnection() {
  try {
    const response = await axios.get(`${RAG_API_URL}/health`, { timeout: 5000 });
    return response.data?.status === 'UP';
  } catch (err) {
    return false;
  }
}

async function uploadFile(filePath) {
  const fileId = generateFileId(filePath);
  const form = new FormData();

  form.append('file', fs.createReadStream(filePath), {
    filename: path.basename(filePath),
    contentType: getContentType(filePath),
  });
  form.append('file_id', fileId);
  form.append('entity_id', RUNPOD_AGENT_ID);

  try {
    // Use the RAG_API_URL directly for the FastAPI service
    const url = `${RAG_API_URL}/embed`;
    console.log(`  Uploading to: ${url}`);

    const res = await axios.post(url, form, {
      headers: {
        Authorization: `Bearer ${getAdminToken()}`,
        accept: 'application/json',
        ...form.getHeaders(),
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: embedTimeoutMs,
    });

    console.log(`  ✓ Upload successful`);

    // The FastAPI endpoint returns file_id in the response
    const returnedFileId = res.data?.file_id;
    if (!returnedFileId) {
      console.log(`  Response data:`, JSON.stringify(res.data, null, 2));
      throw new Error(`Upload succeeded but no file_id returned`);
    }

    return returnedFileId;
  } catch (err) {
    if (err.response) {
      console.error(`  ✗ Upload failed`);
      console.error(`  Status: ${err.response.status}`);
      console.error(`  Data:`, err.response.data);

      // Check if we got HTML instead of JSON (wrong endpoint)
      if (typeof err.response.data === 'string' && err.response.data.includes('<!DOCTYPE html>')) {
        throw new Error(
          'Received HTML instead of JSON - check RAG_API_URL is pointing to FastAPI service, not React frontend',
        );
      }

      throw new Error(`Upload failed: ${err.response.data?.detail || err.response.statusText}`);
    } else if (err.code === 'ECONNREFUSED') {
      throw new Error(`Cannot connect to RAG service at ${RAG_API_URL} - is it running?`);
    } else {
      throw err;
    }
  }
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
  };
  return types[ext] || 'application/octet-stream';
}

async function main() {
  console.log('\n🚀 Starting Victoria Agent Seed\n');

  await connectDb();
  console.log('✓ Connected to MongoDB\n');

  // Test RAG service connection
  console.log(`Testing RAG service at ${RAG_API_URL}...`);
  const ragConnected = await testRagConnection();
  if (!ragConnected) {
    console.error(`\n❌ Cannot connect to RAG service at ${RAG_API_URL}`);
    console.error('Please ensure:');
    console.error('1. The RAG API service is running');
    console.error('2. RAG_API_URL environment variable is set correctly');
    console.error('3. Default is http://localhost:8000 (FastAPI, not the React frontend)\n');
    process.exit(1);
  }
  console.log('✓ RAG service is responding\n');

  const folder = path.resolve(METHODOLOGY_DIR);
  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
    throw new Error(`METHODOLOGY_DIR is not a directory: ${folder}`);
  }
  console.log(`📁 Scanning directory: ${folder}\n`);

  const exts = new Set(['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.txt', '.md']);
  const walkFiles = (dir) => {
    const out = [];
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        out.push(...walkFiles(full));
        continue;
      }
      const ext = path.extname(entry).toLowerCase();
      if (!exts.has(ext)) continue;
      out.push({ full, stat });
    }
    return out.sort((a, b) => a.full.localeCompare(b.full));
  };

  const entries = walkFiles(folder);
  console.log(`Found ${entries.length} files to upload\n`);

  const fileIds = [];
  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;

  for (let i = 0; i < entries.length; i++) {
    const { full, stat } = entries[i];
    const basename = path.basename(full);
    console.log(`[${i + 1}/${entries.length}] ${basename}`);

    const sizeMb = stat.size / (1024 * 1024);
    if (sizeMb > 25) {
      console.warn(`  ⚠ Skipping - file size ${sizeMb.toFixed(2)} MB exceeds 25 MB limit\n`);
      skipCount++;
      continue;
    }

    try {
      const fileId = await uploadFile(full);
      fileIds.push(fileId);
      successCount++;
      console.log(`  File ID: ${fileId}\n`);
    } catch (err) {
      console.error(`  Error: ${err.message}\n`);
      failCount++;
    }
  }

  console.log('\n📊 Upload Summary:');
  console.log(`  ✓ Success: ${successCount}`);
  console.log(`  ⚠ Skipped: ${skipCount}`);
  console.log(`  ✗ Failed: ${failCount}`);
  console.log(`  Total: ${entries.length}\n`);

  await ensureAgent(fileIds);
  console.log(`\n✓ Agent ${RUNPOD_AGENT_ID} configured with ${fileIds.length} files\n`);

  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Fatal error:', err);
  process.exit(1);
});
