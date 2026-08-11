import type { NextFunction, Response } from 'express';

export type EndpointIdentityRequest = {
  params?: { endpoint?: string };
  body?: { endpoint?: unknown };
};

export const ENDPOINT_IDENTITY_MISMATCH = 'Route endpoint does not match request endpoint.';

/**
 * Guards the named chat route. The `:endpoint` segment is a matcher only — every
 * downstream consumer resolves identity from `req.body.endpoint` — so a request whose
 * URL names one endpoint and whose body names another would silently run against the
 * body's endpoint. Requires the two to agree before any model lookup or job creation.
 *
 * Express has already decoded `req.params.endpoint`; it is compared as-is against the
 * raw body value, which the client never encodes.
 */
export const requireEndpointIdentity = (
  req: EndpointIdentityRequest,
  res: Response,
  next: NextFunction,
): void => {
  const bodyEndpoint = req.body?.endpoint;
  if (typeof bodyEndpoint !== 'string' || bodyEndpoint !== req.params?.endpoint) {
    res.status(400).json({ error: ENDPOINT_IDENTITY_MISMATCH });
    return;
  }
  next();
};
