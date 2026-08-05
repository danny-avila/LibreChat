import { attachRequestContext } from './requestLogContext';
import { tenantStorage } from './tenantContext';

describe('attachRequestContext', () => {
  const context = {
    tenantId: 'tenant-123',
    userId: 'user-123',
    requestId: 'request-123',
    requestMethod: 'POST',
    requestPath: '/api/example',
  };

  it.each(['jwt_auth_rejected', 'jwt_auth_recovered', 'tenant_isolation_error'])(
    'omits identity fields from %s while preserving request correlation',
    (eventName) =>
      tenantStorage.run(context, () => {
        const info = {
          level: 'warn',
          message: 'event',
          event_name: eventName,
          tenantId: 'explicit-tenant',
          tenant_id: 'explicit-tenant',
          userId: 'explicit-user',
          user_id: 'explicit-user',
        };

        const result = attachRequestContext(info);

        expect(result).not.toHaveProperty('tenantId');
        expect(result).not.toHaveProperty('tenant_id');
        expect(result).not.toHaveProperty('userId');
        expect(result).not.toHaveProperty('user_id');
        expect(result).toMatchObject({
          requestId: 'request-123',
          request_id: 'request-123',
          method: 'POST',
          path: '/api/example',
        });
      }),
  );

  it('retains identity context on ordinary application logs', () =>
    tenantStorage.run(context, () => {
      const result = attachRequestContext({ level: 'info', message: 'event' });

      expect(result).toMatchObject({
        tenantId: 'tenant-123',
        userId: 'user-123',
        requestId: 'request-123',
        request_id: 'request-123',
        method: 'POST',
        path: '/api/example',
      });
    }));
});
