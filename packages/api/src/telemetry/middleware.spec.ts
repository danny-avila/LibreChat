import { EventEmitter } from 'node:events';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import type { NextFunction, Response } from 'express';
import type { Span } from '@opentelemetry/api';
import type { ServerRequest } from '~/types';
import { telemetryErrorMiddleware, telemetryMiddleware } from './middleware';

interface MockResponse extends EventEmitter {
  statusCode: number;
}

function createSpan(): jest.Mocked<Span> {
  const span = {} as jest.Mocked<Span>;
  span.addEvent = jest.fn<jest.Mocked<Span>, Parameters<Span['addEvent']>>(() => span);
  span.addLink = jest.fn<jest.Mocked<Span>, Parameters<Span['addLink']>>(() => span);
  span.addLinks = jest.fn<jest.Mocked<Span>, Parameters<Span['addLinks']>>(() => span);
  span.end = jest.fn<void, Parameters<Span['end']>>();
  span.isRecording = jest.fn<boolean, Parameters<Span['isRecording']>>(() => true);
  span.recordException = jest.fn<void, Parameters<Span['recordException']>>();
  span.setAttribute = jest.fn<jest.Mocked<Span>, Parameters<Span['setAttribute']>>(() => span);
  span.setAttributes = jest.fn<jest.Mocked<Span>, Parameters<Span['setAttributes']>>(() => span);
  span.setStatus = jest.fn<jest.Mocked<Span>, Parameters<Span['setStatus']>>(() => span);
  span.spanContext = jest.fn<ReturnType<Span['spanContext']>, Parameters<Span['spanContext']>>(
    () => ({
      spanId: '0000000000000000',
      traceFlags: 0,
      traceId: '00000000000000000000000000000000',
    }),
  );
  span.updateName = jest.fn<jest.Mocked<Span>, Parameters<Span['updateName']>>(() => span);
  return span;
}

function createResponse(statusCode = 200): MockResponse {
  const res = new EventEmitter() as MockResponse;
  res.statusCode = statusCode;
  return res;
}

function createRequest(overrides: Partial<ServerRequest> = {}): ServerRequest {
  return {
    baseUrl: '/api/messages',
    body: {
      prompt: 'do not capture this prompt',
      text: 'do not capture this body',
    },
    headers: {
      authorization: 'Bearer do-not-capture-this-auth-header',
      cookie: 'session=do-not-capture-this-cookie',
      'x-api-key': 'do-not-capture-this-api-key',
    },
    method: 'POST',
    path: '/api/messages/conversation-1',
    route: { path: '/:conversationId' },
    user: {
      email: 'do-not-capture@example.com',
      id: 'user-1',
      tenantId: 'tenant-1',
    } as ServerRequest['user'],
    ...overrides,
  } as ServerRequest;
}

describe('telemetryMiddleware', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('passes through without an active span', () => {
    const next = jest.fn();
    jest.spyOn(trace, 'getActiveSpan').mockReturnValue(undefined);

    telemetryMiddleware(createRequest(), createResponse() as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('records safe route and identity attributes without body content', () => {
    const span = createSpan();
    const req = createRequest();
    const res = createResponse(201);
    const next: NextFunction = jest.fn();
    jest.spyOn(trace, 'getActiveSpan').mockReturnValue(span);

    telemetryMiddleware(req, res as Response, next);
    res.emit('finish');

    expect(next).toHaveBeenCalledTimes(1);
    expect(span.setAttributes).toHaveBeenCalledWith({
      'http.request.method': 'POST',
    });
    expect(span.setAttributes).toHaveBeenCalledWith({
      'enduser.id': 'user-1',
      'librechat.tenant.id': 'tenant-1',
    });
    expect(span.setAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        'http.response.status_code': 201,
        'http.route': '/api/messages/:conversationId',
        'url.path': '/api/messages/:conversationId',
      }),
    );

    const capturedAttributes = JSON.stringify(span.setAttributes.mock.calls);
    expect(capturedAttributes).not.toContain('do not capture this prompt');
    expect(capturedAttributes).not.toContain('do not capture this body');
    expect(capturedAttributes).not.toContain('do-not-capture@example.com');
    expect(capturedAttributes).not.toContain('conversation-1');
    expect(capturedAttributes).not.toContain('do-not-capture-this-auth-header');
    expect(capturedAttributes).not.toContain('do-not-capture-this-cookie');
    expect(capturedAttributes).not.toContain('do-not-capture-this-api-key');
  });

  it('ignores health checks', () => {
    const span = createSpan();
    const next = jest.fn();
    jest.spyOn(trace, 'getActiveSpan').mockReturnValue(span);

    telemetryMiddleware(
      createRequest({
        baseUrl: '',
        path: '/health',
        route: undefined,
      }),
      createResponse() as Response,
      next,
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(span.setAttributes).not.toHaveBeenCalled();
  });

  it('uses a low-cardinality fallback for unmatched API routes', () => {
    const span = createSpan();
    const req = createRequest({
      baseUrl: '',
      path: '/api/nonexistent/123',
      route: undefined,
    });
    const res = createResponse(404);
    jest.spyOn(trace, 'getActiveSpan').mockReturnValue(span);

    telemetryMiddleware(req, res as Response, jest.fn());
    res.emit('finish');

    expect(span.setAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        'http.route': '/api/*',
        'http.response.status_code': 404,
        'url.path': '/api/*',
      }),
    );
  });

  it('marks server responses as errored', () => {
    const span = createSpan();
    const req = createRequest();
    const res = createResponse(500);
    jest.spyOn(trace, 'getActiveSpan').mockReturnValue(span);

    telemetryMiddleware(req, res as Response, jest.fn());
    res.emit('finish');

    expect(span.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.ERROR });
  });

  it('records completion attributes only once when finish and close both fire', () => {
    const span = createSpan();
    const res = createResponse(200);
    jest.spyOn(trace, 'getActiveSpan').mockReturnValue(span);

    telemetryMiddleware(createRequest(), res as Response, jest.fn());
    res.emit('finish');
    res.emit('close');

    expect(span.setAttributes).toHaveBeenCalledTimes(3);
  });
});

describe('telemetryErrorMiddleware', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('records exceptions and forwards the error', () => {
    const span = createSpan();
    const error = new TypeError('boom');
    const next = jest.fn();
    jest.spyOn(trace, 'getActiveSpan').mockReturnValue(span);

    telemetryErrorMiddleware(error, createRequest(), createResponse() as Response, next);

    expect(span.recordException).toHaveBeenCalledWith(error);
    expect(span.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.ERROR });
    expect(span.setAttributes).toHaveBeenCalledWith({
      'error.type': 'TypeError',
      'http.route': '/api/messages/:conversationId',
      'url.path': '/api/messages/:conversationId',
    });
    expect(next).toHaveBeenCalledWith(error);
  });

  it('forwards the error without an active span', () => {
    const error = new Error('boom');
    const next = jest.fn();
    jest.spyOn(trace, 'getActiveSpan').mockReturnValue(undefined);

    telemetryErrorMiddleware(error, createRequest(), createResponse() as Response, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});
