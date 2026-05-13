/// <reference types="jest" />
import { normalizePath } from './metrics';

describe('normalizePath', () => {
  it.each([
    // Known high-cardinality routes
    ['/api/messages/507f1f77bcf86cd799439011', '/api/messages/#id'],
    ['/api/convos/507f1f77bcf86cd799439011', '/api/convos/#id'],
    ['/api/files/507f1f77bcf86cd799439011', '/api/files/#id'],
    ['/api/agents/507f1f77bcf86cd799439011', '/api/agents/#id'],
    ['/api/assistants/507f1f77bcf86cd799439011', '/api/assistants/#id'],
    ['/api/share/some-token-value', '/api/share/#token'],
    ['/share/shareId-with_nanoidChars', '/share/#id'],
    ['/share/shareId-with_nanoidChars/edit', '/share/#id/edit'],
    // Catch-all: ObjectId in unknown routes (lower and upper case)
    ['/api/tags/507f1f77bcf86cd799439011', '/api/tags/#id'],
    ['/api/tags/507F1F77BCF86CD799439011', '/api/tags/#id'],
    ['/api/tools/507f1f77bcf86cd799439011', '/api/tools/#id'],
    ['/api/runs/507f1f77bcf86cd799439011', '/api/runs/#id'],
    // Catch-all: UUID in unknown routes
    ['/api/tools/123e4567-e89b-12d3-a456-426614174000', '/api/tools/#id'],
    ['/api/sessions/123E4567-E89B-12D3-A456-426614174000', '/api/sessions/#id'],
    // Multiple dynamic segments
    [
      '/api/convos/507f1f77bcf86cd799439011/messages/507f1f77bcf86cd799439012',
      '/api/convos/#id/messages/#id',
    ],
    // Static paths are not modified
    ['/api/auth/login', '/api/auth/login'],
    ['/api/config', '/api/config'],
    ['/health', '/health'],
    ['/metrics', '/metrics'],
    ['/', '/'],
  ])('normalizes %s -> %s', (input: string, normalized: string) => {
    expect(normalizePath(input)).toBe(normalized);
  });
});
