import type { TConfig } from 'bizu-data-provider';

export type TCustomEndpointsConfig = Partial<{ [key: string]: Omit<TConfig, 'order'> }>;
