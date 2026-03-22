# Capability: openclaw-gateway-client

## Requirement: WebSocket RPC Client Initialization
The `OpenClawGatewayClient` SHALL accept `url` and `apiKey` options and default `connectTimeoutMs` to 10 000 and `rpcTimeoutMs` to 30 000.

#### Scenario: Default timeouts
- GIVEN `new OpenClawGatewayClient({ url: 'ws://localhost', apiKey: 'k' })`
- WHEN timeouts are not specified
- THEN `connectTimeoutMs === 10_000` and `rpcTimeoutMs === 30_000`

## Requirement: Connected State
The `connected` getter SHALL return `false` before `connect()` and `true` after successful connection.

#### Scenario: Initial state
- GIVEN a newly constructed client
- WHEN `connected` is read
- THEN it returns `false`

## Requirement: Gateway Manager Singleton
`gatewayManager.getClient(url, apiKey)` SHALL return the same client instance for the same `url::apiKey` key.

#### Scenario: Singleton lookup
- GIVEN `getClient('ws://host', 'key')` called twice
- WHEN the second call uses the same url and apiKey
- THEN both calls return the same `OpenClawGatewayClient` instance

## Requirement: Exponential Backoff
On connection failure, the gateway manager SHALL double `reconnectMs` up to `MAX_RECONNECT_MS` (30 000 ms).

#### Scenario: Backoff cap
- GIVEN repeated failures
- WHEN `reconnectMs` exceeds 30 000
- THEN it is capped at 30 000
