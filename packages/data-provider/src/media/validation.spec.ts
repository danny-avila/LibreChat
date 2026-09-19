import type { MediaSubmissionRequest } from './requests';
import type { MediaCapability } from './capabilities';
import { mediaCapabilitySchema, mediaLimitsSchema } from './capabilities';
import { validateMediaCapability } from './validation';

const limits = mediaLimitsSchema.parse({});
const capability: MediaCapability = {
  operation: 'video.generate',
  inputs: { roles: ['reference', 'audio'], min: 0, max: 2 },
  execution: { kind: 'remote-job', cancellation: 'unsupported' },
  controls: {
    count: { min: 1, max: 1 },
    durationSeconds: { min: 4, max: 10, values: [4, 6, 8, 10] },
    resolution: { values: ['720P', '1080P'] },
    aspectRatio: { values: ['1:1', '16:9', '9:16'] },
    providerOptions: ['voice_id'],
  },
};
const request: Pick<MediaSubmissionRequest, 'operation' | 'parameters' | 'inputs'> = {
  operation: 'video.generate',
  parameters: { count: 1 },
  inputs: [],
};

test('conditional requirements reject defaults incompatible with reference inputs', () => {
  const constrained = mediaCapabilitySchema.parse({
    ...capability,
    constraints: [
      {
        when: [{ kind: 'input', role: 'reference', present: true }],
        anyOf: [{ kind: 'parameter', name: 'durationSeconds', values: [8] }],
      },
    ],
  });
  const value = {
    ...request,
    inputs: [{ role: 'reference' as const, file_id: 'image' }],
    parameters: { count: 1, durationSeconds: 4 },
  };
  expect(validateMediaCapability(value, constrained, limits)).toEqual([
    expect.objectContaining({ field: 'durationSeconds' }),
  ]);
  expect(
    validateMediaCapability(
      { ...value, parameters: { count: 1, durationSeconds: 8 } },
      constrained,
      limits,
    ),
  ).toEqual([]);
  expect(validateMediaCapability({ ...value, inputs: [] }, constrained, limits)).toEqual([]);
});

test('resolution and absent-reference constraints compose and check discrete values', () => {
  const constrained = mediaCapabilitySchema.parse({
    ...capability,
    constraints: [
      {
        when: [{ kind: 'parameter', name: 'resolution', values: ['1080P'] }],
        anyOf: [{ kind: 'parameter', name: 'durationSeconds', values: [6] }],
      },
      {
        when: [{ kind: 'input', role: 'reference', present: false }],
        anyOf: [{ kind: 'parameter', name: 'aspectRatio', values: ['16:9', '9:16'] }],
      },
    ],
  });
  const value = {
    ...request,
    parameters: { count: 1, durationSeconds: 10, resolution: '1080P', aspectRatio: '1:1' },
  };
  expect(validateMediaCapability(value, constrained, limits).map((issue) => issue.field)).toEqual([
    'durationSeconds',
    'aspectRatio',
  ]);
  expect(
    validateMediaCapability(
      { ...value, parameters: { ...value.parameters, durationSeconds: 6, aspectRatio: '16:9' } },
      constrained,
      limits,
    ),
  ).toEqual([]);
  expect(
    validateMediaCapability(
      { ...request, parameters: { count: 1, durationSeconds: 5 } },
      capability,
      limits,
    ),
  ).toEqual([expect.objectContaining({ field: 'durationSeconds' })]);
});

test('alternative input or provider option requirements reject blank values', () => {
  const constrained = mediaCapabilitySchema.parse({
    ...capability,
    constraints: [
      {
        anyOf: [
          { kind: 'input', role: 'audio', present: true },
          { kind: 'parameter', name: 'providerOptions', option: 'voice_id', present: true },
        ],
      },
    ],
  });
  expect(validateMediaCapability(request, constrained, limits)).not.toEqual([]);
  expect(
    validateMediaCapability(
      { ...request, parameters: { count: 1, providerOptions: { voice_id: '  ' } } },
      constrained,
      limits,
    ),
  ).not.toEqual([]);
  expect(
    validateMediaCapability(
      { ...request, parameters: { count: 1, providerOptions: { voice_id: 'voice' } } },
      constrained,
      limits,
    ),
  ).toEqual([]);
  expect(
    validateMediaCapability(
      { ...request, inputs: [{ role: 'audio', file_id: 'recording' }] },
      constrained,
      limits,
    ),
  ).toEqual([]);
  expect(validateMediaCapability(request, constrained, limits, { checkInputs: false })).toEqual([]);
});

test('settings-only preset validation still rejects unsupported values and oversized provider data', () => {
  expect(
    validateMediaCapability(
      { ...request, parameters: { count: 1, durationSeconds: 5 } },
      capability,
      limits,
      { checkInputs: false },
    ),
  ).not.toEqual([]);
  expect(
    validateMediaCapability(
      { ...request, parameters: { count: 1, providerOptions: { voice_id: 'é'.repeat(20) } } },
      capability,
      { ...limits, maxProviderOptionBytes: 30 },
    ),
  ).toEqual([expect.objectContaining({ field: 'providerOptions' })]);
});
