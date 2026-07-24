import type { IEventTransport } from '../interfaces/IJobStore';

/**
 * Internal publication result used to fence same-replica replay against Redis Pub/Sub.
 * `number` is the zero-based Redis sequence and `false` means publication failed.
 */
export type ChunkPublicationReceipt = number | false | void;

type ChunkPublicationCapability = (
  streamId: string,
  event: unknown,
) => Promise<ChunkPublicationReceipt>;

/**
 * Keep transport-specific sequencing out of the exported IEventTransport contract.
 * The WeakMap also keeps the capability off exported transport class declarations.
 */
const chunkPublicationCapabilities = new WeakMap<IEventTransport, ChunkPublicationCapability>();

export function registerChunkPublicationCapability(
  transport: IEventTransport,
  capability: ChunkPublicationCapability,
): void {
  chunkPublicationCapabilities.set(transport, capability);
}

/**
 * Publish through a transport's internal receipt capability when available.
 * Unsequenced and third-party transports retain the public emitChunk contract.
 */
export function emitChunkWithReceipt(
  transport: IEventTransport,
  streamId: string,
  event: unknown,
): Promise<ChunkPublicationReceipt> {
  const capability = chunkPublicationCapabilities.get(transport);
  if (capability) {
    return capability(streamId, event);
  }
  return Promise.resolve(transport.emitChunk(streamId, event));
}
