const AgentClient = require('../client');
const {
  isSteeringSupported,
  isSteerPreemptSupported,
  isSteerTerminalContinuationSupported,
} = require('@librechat/api');

jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  isSteeringSupported: jest.fn(() => true),
  isSteerPreemptSupported: jest.fn(() => true),
  isSteerTerminalContinuationSupported: jest.fn(() => true),
}));

const mockIsSteeringSupported = isSteeringSupported;
const mockIsPreemptSupported = isSteerPreemptSupported;
const mockIsTerminalContinuationSupported = isSteerTerminalContinuationSupported;

/** Minimal `this` for the wiring builder — it only reads these three. */
function buildWiring(streamId, { jobCreatedAt = 1700000000000 } = {}) {
  const self = {
    jobCreatedAt,
    options: { req: { user: { id: 'user-1' } } },
    applySteerPart: jest.fn(),
  };
  return AgentClient.prototype.buildSteerWiring.call(self, streamId);
}

describe('AgentClient.buildSteerWiring — preempt capability gating', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsSteeringSupported.mockReturnValue(true);
    mockIsPreemptSupported.mockReturnValue(true);
    mockIsTerminalContinuationSupported.mockReturnValue(true);
  });

  it('returns both boundary hooks and the poll when preempt is supported', () => {
    const wiring = buildWiring('stream-1');

    expect(typeof wiring.hook).toBe('function');
    expect(typeof wiring.preemptHook).toBe('function');
    expect(typeof wiring.preemption?.shouldPreempt).toBe('function');
    expect(typeof wiring.terminalHook).toBe('function');
  });

  it('omits only terminal continuation when the SDK lacks Stop continuation', () => {
    mockIsTerminalContinuationSupported.mockReturnValue(false);
    const wiring = buildWiring('stream-terminal-unsupported');

    expect(typeof wiring.hook).toBe('function');
    expect(typeof wiring.preemptHook).toBe('function');
    expect(wiring.terminalHook).toBeUndefined();
  });

  /**
   * The separate capability probe is what keeps an interrupt affordance from
   * arming against an SDK that can only inject at tool boundaries: steering
   * still wires, preemption does not.
   */
  it('omits the preempt wiring when only tool-boundary steering is supported', () => {
    mockIsPreemptSupported.mockReturnValue(false);
    const wiring = buildWiring('stream-2');

    expect(typeof wiring.hook).toBe('function');
    expect(wiring.preemptHook).toBeUndefined();
    expect(wiring.preemption).toBeUndefined();
  });

  it('returns undefined entirely when steering itself is unsupported', () => {
    mockIsSteeringSupported.mockReturnValue(false);
    expect(buildWiring('stream-3')).toBeUndefined();
  });

  it('returns undefined without a streamId (no resumable job surface)', () => {
    expect(buildWiring(undefined)).toBeUndefined();
    expect(buildWiring('')).toBeUndefined();
  });

  /**
   * Both boundaries must drain through the same closures, or the two
   * injection sites could persist steer parts differently — the SDK's
   * provider-safety argument assumes identical shapes.
   */
  it('builds both hooks from one shared closures object', () => {
    const applySteerPart = jest.fn();
    const self = {
      jobCreatedAt: 1700000000000,
      options: { req: { user: { id: 'user-1' } } },
      applySteerPart,
    };
    const wiring = AgentClient.prototype.buildSteerWiring.call(self, 'stream-4');

    expect(wiring.hook).not.toBe(wiring.preemptHook);
    expect(applySteerPart).not.toHaveBeenCalled();
  });
});
