import { getAgentAvatarUrl, getContactDisplayName } from '../agents';
import type t from 'librechat-data-provider';

describe('Agent Utilities', () => {
  describe('getAgentAvatarUrl', () => {
    it('should return null for null agent', () => {
      expect(getAgentAvatarUrl(null)).toBeNull();
    });

    it('should return null for undefined agent', () => {
      expect(getAgentAvatarUrl(undefined)).toBeNull();
    });

    it('should return null for agent without avatar', () => {
      const agent = { id: '1', name: 'Test Agent' } as t.Agent;
      expect(getAgentAvatarUrl(agent)).toBeNull();
    });

    it('should return string avatar directly', () => {
      const agent = {
        id: '1',
        name: 'Test Agent',
        avatar: '/path/to/avatar.png',
      } as unknown as t.Agent;
      expect(getAgentAvatarUrl(agent)).toBe('/path/to/avatar.png');
    });

    it('should extract filepath from object avatar', () => {
      const agent = {
        id: '1',
        name: 'Test Agent',
        avatar: { filepath: '/path/to/object-avatar.png' },
      } as t.Agent;
      expect(getAgentAvatarUrl(agent)).toBe('/path/to/object-avatar.png');
    });

    it('should return null for object avatar without filepath', () => {
      const agent = {
        id: '1',
        name: 'Test Agent',
        avatar: { someOtherProperty: 'value' },
      } as any;
      expect(getAgentAvatarUrl(agent)).toBeNull();
    });
  });

  describe('getContactDisplayName', () => {
    it('should return null for null agent', () => {
      expect(getContactDisplayName(null)).toBeNull();
    });

    it('should return null for undefined agent', () => {
      expect(getContactDisplayName(undefined)).toBeNull();
    });

    it('should prioritize support_contact name', () => {
      const agent = {
        id: '1',
        support_contact: { name: 'Support Team', email: 'support@example.com' },
        authorName: 'John Doe',
      } as any;
      expect(getContactDisplayName(agent)).toBe('Support Team');
    });

    it('should use authorName when support_contact name is missing', () => {
      const agent = {
        id: '1',
        support_contact: { email: 'support@example.com' },
        authorName: 'John Doe',
      } as any;
      expect(getContactDisplayName(agent)).toBe('John Doe');
    });

    it('should use support_contact email when both name and authorName are missing', () => {
      const agent = {
        id: '1',
        support_contact: { email: 'support@example.com' },
      } as any;
      expect(getContactDisplayName(agent)).toBe('support@example.com');
    });

    it('should return null when no contact info is available', () => {
      const agent = {
        id: '1',
        name: 'Test Agent',
      } as any;
      expect(getContactDisplayName(agent)).toBeNull();
    });
  });
});
