import { logger } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';
import { getNangoClient, isNangoConfigured } from './client';
import type { NangoService } from './service';
import { parseNangoAuthWebhookPayload } from './webhook';

export interface NangoWebhookHandlersDeps {
  nangoService: NangoService;
}

export function createNangoWebhookHandler(deps: NangoWebhookHandlersDeps) {
  const { nangoService } = deps;

  return async function nangoWebhookHandler(req: ServerRequest, res: Response) {
    try {
      if (!isNangoConfigured()) {
        return res.status(503).json({ error: 'Integrations are not configured' });
      }

      const rawBody = req.body;
      if (!Buffer.isBuffer(rawBody)) {
        return res.status(400).json({ error: 'Invalid webhook payload' });
      }

      const bodyText = rawBody.toString('utf8');
      const nango = getNangoClient();
      const isValid = nango.verifyIncomingWebhookRequest(bodyText, req.headers);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }

      const payload = parseNangoAuthWebhookPayload(JSON.parse(bodyText));
      if (payload) {
        await nangoService.processAuthWebhook(payload);
      }

      return res.status(200).json({ success: true });
    } catch (error) {
      logger.error('[webhooks/nango] handler error:', error);
      return res.status(500).json({ error: 'Failed to process Nango webhook' });
    }
  };
}
