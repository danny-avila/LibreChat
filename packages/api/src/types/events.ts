export type ServerSentEvent = {
  data: string | Record<string, unknown>;
  event?: string;
};
