import { runChannelGateway } from './gateway';

void runChannelGateway(process.env, (code) => console.warn(code)).catch(() => {
  console.error('gateway_start_failed');
  process.exitCode = 1;
});
