#!/usr/bin/env node

/**
 * LibreChat Cache Flush Utility
 *
 * This script flushes the cache store used by LibreChat, whether it's
 * Redis (if configured) or file-based cache.
 *
 * Usage:
 *   npm run flush-cache
 *   node config/flush-cache.js
 *   node config/flush-cache.js --help
 */

const path = require('path');
const fs = require('fs');

// Set up environment
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const {
  USE_REDIS,
  REDIS_URI,
  REDIS_USERNAME,
  REDIS_PASSWORD,
  REDIS_CA,
  REDIS_KEY_PREFIX,
  USE_REDIS_CLUSTER,
  REDIS_USE_ALTERNATIVE_DNS_LOOKUP,
} = process.env;

// Simple utility function
const isEnabled = (value) => value === 'true' || value === true;

// Helper function to read Redis CA certificate
const getRedisCA = () => {
  if (!REDIS_CA) {
    return null;
  }
  try {
    if (fs.existsSync(REDIS_CA)) {
      return fs.readFileSync(REDIS_CA, 'utf8');
    } else {
      console.warn(`⚠️  Redis CA certificate file not found: ${REDIS_CA}`);
      return null;
    }
  } catch (error) {
    console.error(`❌ Failed to read Redis CA certificate file '${REDIS_CA}':`, error.message);
    return null;
  }
};

async function showHelp() {
  console.log(`
LibreChat Cache Flush Utility

DESCRIPTION:
  Flushes the cache store used by LibreChat. Automatically detects
  whether Redis or file-based cache is being used and flushes accordingly.

USAGE:
  npm run flush-cache
  node config/flush-cache.js [options]

OPTIONS:
  --help, -h      Show this help message
  --dry-run       Show what would be flushed without actually doing it
  --verbose, -v   Show detailed output

CACHE TYPES:
  • Redis Cache:     Flushes all keys with the configured Redis prefix
  • File Cache:      Removes ./data/logs.json and ./data/violations.json

WHAT GETS FLUSHED:
  • User sessions and authentication tokens
  • Configuration cache
  • Model queries cache
  • Rate limiting data
  • Conversation titles cache
  • File upload progress
  • SharePoint tokens
  • And more...

NOTE: This will log out all users and may require them to re-authenticate.
`);
}

async function flushRedisCache(dryRun = false, verbose = false) {
  try {
    console.log('🔍 Redis cache detected');

    if (verbose) {
      console.log(`   URI: ${REDIS_URI ? REDIS_URI.replace(/\/\/.*@/, '//***:***@') : 'Not set'}`);
      console.log(`   Prefix: ${REDIS_KEY_PREFIX || 'None'}`);
    }

    // Create Redis client using same pattern as main app
    const IoRedis = require('ioredis');
    let redis;

    // Parse credentials from URI or use environment variables (same as redisClients.ts)
    const urls = (REDIS_URI || '').split(',').map((uri) => new URL(uri));
    const username = urls[0]?.username || REDIS_USERNAME;
    const password = urls[0]?.password || REDIS_PASSWORD;
    const ca = getRedisCA();

    // Redis options (matching redisClients.ts configuration)
    const redisOptions = {
      username: username,
      password: password,
      tls: ca ? { ca } : undefined,
      connectTimeout: 10000,
      maxRetriesPerRequest: 3,
      enableOfflineQueue: true,
      lazyConnect: false,
    };

    // Handle cluster vs single Redis (same logic as redisClients.ts)
    const useCluster = urls.length > 1 || isEnabled(USE_REDIS_CLUSTER);

    if (useCluster) {
      const clusterOptions = {
        redisOptions,
        enableOfflineQueue: true,
      };

      // Add DNS lookup for AWS ElastiCache if needed (same as redisClients.ts)
      if (isEnabled(REDIS_USE_ALTERNATIVE_DNS_LOOKUP)) {
        clusterOptions.dnsLookup = (address, callback) => callback(null, address);
      }

      redis = new IoRedis.Cluster(
        urls.map((url) => ({ host: url.hostname, port: parseInt(url.port, 10) || 6379 })),
        clusterOptions,
      );
    } else {
      // @ts-ignore - ioredis default export is constructable despite linter warning
      redis = new IoRedis(REDIS_URI, redisOptions);
    }

    // Wait for connection
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 10000);

      redis.once('ready', () => {
        clearTimeout(timeout);
        resolve(undefined);
      });

      redis.once('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    if (dryRun) {
      console.log('🔍 [DRY RUN] Would flush Redis cache');
      try {
        const keys = await redis.keys('*');
        console.log(`   Would delete ${keys.length} keys`);
        if (verbose && keys.length > 0) {
          console.log(
            '   Sample keys:',
            keys.slice(0, 10).join(', ') + (keys.length > 10 ? '...' : ''),
          );
        }
      } catch (error) {
        console.log('   Could not fetch keys for preview:', error.message);
      }
      await redis.disconnect();
      return true;
    }

    // Get key count before flushing
    let keyCount = 0;
    try {
      const keys = await redis.keys('*');
      keyCount = keys.length;
    } catch (_error) {
      // Continue with flush even if we can't count keys
    }

    // Flush the Redis cache
    await redis.flushdb();
    console.log('✅ Redis cache flushed successfully');

    if (keyCount > 0) {
      console.log(`   Deleted ${keyCount} keys`);
    }

    await redis.disconnect();
    return true;
  } catch (error) {
    console.error('❌ Error flushing Redis cache:', error.message);
    if (verbose) {
      console.error('   Full error:', error);
    }
    return false;
  }
}

async function flushFileCache(dryRun = false, verbose = false) {
  const dataDir = path.join(__dirname, '..', 'data');
  const filesToClear = [path.join(dataDir, 'logs.json'), path.join(dataDir, 'violations.json')];

  console.log('🔍 Checking file-based cache');

  if (dryRun) {
    console.log('🔍 [DRY RUN] Would flush file cache');
    for (const filePath of filesToClear) {
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        console.log(
          `   Would delete: ${path.basename(filePath)} (${(stats.size / 1024).toFixed(1)} KB)`,
        );
      }
    }
    return true;
  }

  let deletedCount = 0;
  let totalSize = 0;

  for (const filePath of filesToClear) {
    try {
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        totalSize += stats.size;
        fs.unlinkSync(filePath);
        deletedCount++;
        if (verbose) {
          console.log(
            `   ✅ Deleted ${path.basename(filePath)} (${(stats.size / 1024).toFixed(1)} KB)`,
          );
        }
      }
    } catch (error) {
      if (verbose) {
        console.log(`   ❌ Failed to delete ${path.basename(filePath)}: ${error.message}`);
      }
    }
  }

  if (deletedCount > 0) {
    console.log('✅ File cache flushed successfully');
    console.log(`   Deleted ${deletedCount} cache files (${(totalSize / 1024).toFixed(1)} KB)`);
  } else {
    console.log('ℹ️  No file cache to flush');
  }

  return true;
}

async function restartRecommendation() {
  console.log('\n💡 RECOMMENDATION:');
  console.log('   For complete cache clearing, especially for in-memory caches,');
  console.log('   consider restarting the LibreChat backend:');
  console.log('');
  console.log('     npm run backend:stop');
  console.log('     npm run backend:dev');
  console.log('');
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose') || args.includes('-v');
  const help = args.includes('--help') || args.includes('-h');

  if (help) {
    await showHelp();
    return;
  }

  console.log('🧹 LibreChat Cache Flush Utility');
  console.log('================================');

  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No actual changes will be made\n');
  }

  let success = true;
  const isRedisEnabled = isEnabled(USE_REDIS) || (REDIS_URI != null && REDIS_URI !== '');

  // Flush the appropriate cache type
  if (isRedisEnabled) {
    success = (await flushRedisCache(dryRun, verbose)) && success;
  } else {
    console.log('ℹ️  Redis not configured, using file-based cache only');
  }

  // Always check file cache
  success = (await flushFileCache(dryRun, verbose)) && success;

  console.log('\n' + '='.repeat(50));

  if (success) {
    if (dryRun) {
      console.log('✅ Cache flush preview completed');
      console.log('   Run without --dry-run to actually flush the cache');
    } else {
      console.log('✅ Cache flush completed successfully');
      console.log('⚠️  Note: All users will need to re-authenticate');
    }

    if (!isRedisEnabled) {
      await restartRecommendation();
    }
  } else {
    console.log('❌ Cache flush completed with errors');
    console.log('   Check the output above for details');
    process.exit(1);
  }
}

// Handle errors gracefully
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  process.exit(1);
});

// Run the main function
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { flushRedisCache, flushFileCache };
