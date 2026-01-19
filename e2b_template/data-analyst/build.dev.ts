import 'dotenv/config';
import { Template, defaultBuildLogger } from 'e2b'
import { template } from './template'

async function main() {
  await Template.build(template, {
    alias: 'data-analyst-dev',
    cpuCount: 8,      // 8 vCPUs (E2B Hobby Plan max)
    memoryMB: 8192,   // 8GB RAM (E2B Hobby Plan max)
    onBuildLogs: defaultBuildLogger(),
  });
}

main().catch(console.error);