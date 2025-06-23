#!/usr/bin/env node

/**
 * Standalone script to generate embeddings for notes that don't have them
 * Can be run as a cron job to ensure all notes have embeddings for semantic search
 * 
 * Usage:
 *   node generate-missing-embeddings.js [--dry-run] [--limit=100] [--batch-size=10]
 */

const { Pool } = require('pg');
const axios = require('axios');

// Configuration
const config = {
  dryRun: process.argv.includes('--dry-run'),
  limit: parseInt(process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1]) || 100,
  batchSize: parseInt(process.argv.find(arg => arg.startsWith('--batch-size='))?.split('=')[1]) || 10,
  delayMs: 1000, // Delay between batches to avoid rate limiting
};

console.log('🚀 Starting embedding generation for missing notes...');
console.log('Configuration:', config);

// PostgreSQL connection
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'vectordb',
  port: process.env.POSTGRES_PORT || 5432,
  database: process.env.POSTGRES_DB || 'mydatabase',
  user: process.env.POSTGRES_USER || 'myuser',
  password: process.env.POSTGRES_PASSWORD || 'mypassword',
});

async function generateEmbedding(text) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('No OpenAI API key configured');
    }

    const response = await axios.post('https://api.openai.com/v1/embeddings', {
      input: text,
      model: 'text-embedding-3-small',
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000
    });
    
    if (response.data && response.data.data && response.data.data[0] && response.data.data[0].embedding) {
      return response.data.data[0].embedding;
    } else {
      throw new Error('Invalid embedding response from OpenAI');
    }
  } catch (error) {
    console.error(`❌ Failed to generate embedding: ${error.message}`);
    return null;
  }
}

async function findNotesWithoutEmbeddings(limit) {
  const client = await pool.connect();
  try {
    const query = `
      SELECT n.id, n.title, n.content, c.name as collection_name
      FROM notes n
      JOIN collections c ON n.collection_id = c.id
      LEFT JOIN note_vectors v ON n.id = v.note_id
      WHERE v.note_id IS NULL
      ORDER BY n.created_at ASC
      LIMIT $1
    `;
    
    const result = await client.query(query, [limit]);
    return result.rows;
  } finally {
    client.release();
  }
}

async function storeEmbedding(noteId, embedding) {
  if (config.dryRun) {
    console.log(`  [DRY RUN] Would store embedding for note ${noteId}`);
    return true;
  }

  const client = await pool.connect();
  try {
    const vectorLiteral = `[${embedding.join(',')}]`;
    await client.query(
      'INSERT INTO note_vectors (note_id, embedding) VALUES ($1, $2::vector)',
      [noteId, vectorLiteral]
    );
    return true;
  } catch (error) {
    console.error(`❌ Failed to store embedding for note ${noteId}:`, error.message);
    return false;
  } finally {
    client.release();
  }
}

async function processBatch(notes) {
  let successCount = 0;
  let failureCount = 0;

  for (const note of notes) {
    const embeddingText = `${note.title}\n\n${note.content}`;
    console.log(`  Processing note ${note.id} from collection "${note.collection_name}"...`);
    
    const embedding = await generateEmbedding(embeddingText);
    if (embedding) {
      const stored = await storeEmbedding(note.id, embedding);
      if (stored) {
        successCount++;
        console.log(`  ✅ Generated embedding for note ${note.id}`);
      } else {
        failureCount++;
      }
    } else {
      failureCount++;
      console.log(`  ❌ Failed to generate embedding for note ${note.id}`);
    }
  }

  return { successCount, failureCount };
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  try {
    // Find notes without embeddings
    console.log(`\n🔍 Looking for notes without embeddings (limit: ${config.limit})...`);
    const notesWithoutEmbeddings = await findNotesWithoutEmbeddings(config.limit);
    
    if (notesWithoutEmbeddings.length === 0) {
      console.log('✅ All notes already have embeddings!');
      return;
    }

    console.log(`📝 Found ${notesWithoutEmbeddings.length} notes without embeddings`);

    // Process in batches
    let totalSuccess = 0;
    let totalFailures = 0;
    
    for (let i = 0; i < notesWithoutEmbeddings.length; i += config.batchSize) {
      const batch = notesWithoutEmbeddings.slice(i, i + config.batchSize);
      const batchNum = Math.floor(i / config.batchSize) + 1;
      const totalBatches = Math.ceil(notesWithoutEmbeddings.length / config.batchSize);
      
      console.log(`\n📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} notes)...`);
      
      const { successCount, failureCount } = await processBatch(batch);
      totalSuccess += successCount;
      totalFailures += failureCount;
      
      // Delay between batches to avoid rate limiting
      if (i + config.batchSize < notesWithoutEmbeddings.length) {
        console.log(`  ⏳ Waiting ${config.delayMs}ms before next batch...`);
        await delay(config.delayMs);
      }
    }

    console.log('\n📊 Summary:');
    console.log(`  ✅ Successfully processed: ${totalSuccess} notes`);
    console.log(`  ❌ Failed: ${totalFailures} notes`);
    console.log(`  📈 Success rate: ${Math.round((totalSuccess / (totalSuccess + totalFailures)) * 100)}%`);

    if (config.dryRun) {
      console.log('\n💡 This was a dry run. Run without --dry-run to actually generate embeddings.');
    }

  } catch (error) {
    console.error('💥 Script failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

// Run the script
main().catch(async (error) => {
  console.error('💥 Unhandled error:', error);
  await pool.end();
  process.exit(1);
});