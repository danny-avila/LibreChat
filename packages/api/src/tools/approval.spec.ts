import { requiresApproval, matchesPattern, getToolServerName } from './approval';

describe('approval.ts', () => {
  describe('matchesPattern', () => {
    it('should match exact tool name', () => {
      expect(matchesPattern('send_email', 'send_email')).toBe(true);
    });

    it('should not match different tool name', () => {
      expect(matchesPattern('send_email', 'read_email')).toBe(false);
    });

    it('should match "all" pattern', () => {
      expect(matchesPattern('any_tool', 'all')).toBe(true);
    });

    it('should match "mcp:*" pattern for _mcp_ tools', () => {
      expect(matchesPattern('list_files_mcp_server1', 'mcp:*')).toBe(true);
    });

    it('should match "mcp_*" pattern for _mcp_ tools', () => {
      expect(matchesPattern('list_files_mcp_server1', 'mcp_*')).toBe(true);
    });

    it('should match "mcp:*" pattern for :::mcp::: tools', () => {
      expect(matchesPattern('list_files:::mcp:::server1', 'mcp:*')).toBe(true);
    });

    it('should not match "mcp:*" for non-MCP tools', () => {
      expect(matchesPattern('execute_code', 'mcp:*')).toBe(false);
    });

    it('should match trailing wildcard prefix', () => {
      expect(matchesPattern('send_gmail_message_mcp_google', 'send_gmail_*')).toBe(true);
    });

    it('should not match wildcard with wrong prefix', () => {
      expect(matchesPattern('read_email_mcp_google', 'send_gmail_*')).toBe(false);
    });
  });

  describe('requiresApproval', () => {
    it('should return false when toolApproval is undefined', () => {
      expect(requiresApproval('any_tool', undefined)).toBe(false);
    });

    it('should return false when required is false', () => {
      expect(requiresApproval('any_tool', { required: false })).toBe(false);
    });

    it('should return false when required is undefined', () => {
      expect(requiresApproval('any_tool', { required: undefined })).toBe(false);
    });

    it('should return true when required is true', () => {
      expect(requiresApproval('any_tool', { required: true })).toBe(true);
    });

    it('should return true when required is true even for non-MCP tools', () => {
      expect(requiresApproval('execute_code', { required: true })).toBe(true);
    });

    it('should return false when required is true but tool is excluded', () => {
      expect(
        requiresApproval('safe_tool', { required: true, excluded: ['safe_tool'] }),
      ).toBe(false);
    });

    it('should return false when tool matches excluded wildcard', () => {
      expect(
        requiresApproval('list_files_mcp_server1', { required: true, excluded: ['list_files_*'] }),
      ).toBe(false);
    });

    it('should return true for matching pattern in required array', () => {
      expect(
        requiresApproval('send_email_mcp_google', { required: ['send_email_*'] }),
      ).toBe(true);
    });

    it('should return false for non-matching pattern in required array', () => {
      expect(
        requiresApproval('read_email_mcp_google', { required: ['send_email_*'] }),
      ).toBe(false);
    });

    it('should support mcp:* in required array', () => {
      expect(
        requiresApproval('list_files_mcp_server1', { required: ['mcp:*'] }),
      ).toBe(true);
    });

    it('should support "all" in required array', () => {
      expect(requiresApproval('any_tool', { required: ['all'] })).toBe(true);
    });

    it('should respect excluded over required array', () => {
      expect(
        requiresApproval('safe_tool_mcp_server1', {
          required: ['mcp:*'],
          excluded: ['safe_tool_*'],
        }),
      ).toBe(false);
    });
  });

  describe('getToolServerName', () => {
    it('should extract server name from _mcp_ delimiter', () => {
      expect(getToolServerName('list_files_mcp_google')).toBe('google');
    });

    it('should extract server name from :::mcp::: delimiter', () => {
      expect(getToolServerName('list_files:::mcp:::google')).toBe('google');
    });

    it('should return "builtin" for non-MCP tools', () => {
      expect(getToolServerName('execute_code')).toBe('builtin');
    });
  });
});
