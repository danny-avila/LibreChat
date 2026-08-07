import type { Response } from 'express';

export type PiiRoutingDecision = {
  action: 'send_as_is';
};

const decisions = new WeakMap<Response, PiiRoutingDecision>();

export const setPiiRoutingDecision = (res: Response, decision: PiiRoutingDecision): void => {
  decisions.set(res, decision);
};

export const getPiiRoutingDecision = (res: Response): PiiRoutingDecision | undefined =>
  decisions.get(res);
