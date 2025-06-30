import { Response } from 'express';
import type { TUser } from 'librechat-data-provider';
import { getMCPServers, createMCPServer, updateMCPServer, deleteMCPServer } from './servers';
import type { AuthenticatedRequest, MCPRequest, MCPParamsRequest } from '../types';

describe('MCP Server Functions', () => {
  let mockReq: Partial<AuthenticatedRequest>;
  let mockRes: Partial<Response>;
  let mockUser: TUser;

  beforeEach(() => {
    mockUser = { id: 'user123' } as TUser;

    mockReq = { user: mockUser };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getMCPServers', () => {
    it('should return mock MCP servers', async () => {
      await getMCPServers(mockReq as AuthenticatedRequest, mockRes as Response);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            mcp_id: 'mcp_weather_001',
            metadata: expect.objectContaining({
              name: 'Weather Service',
            }),
          }),
          expect.objectContaining({
            mcp_id: 'mcp_calendar_002',
            metadata: expect.objectContaining({
              name: 'Calendar Manager',
            }),
          }),
        ]),
      );
    });

    it('should reject unauthenticated requests', async () => {
      mockReq.user = undefined;

      await getMCPServers(mockReq as AuthenticatedRequest, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'User not authenticated' });
    });
  });

  describe('createMCPServer', () => {
    beforeEach(() => {
      mockReq.body = {
        mcp_id: 'mcp_test_123',
        metadata: {
          name: 'Test MCP Server',
          description: 'A test MCP server',
          url: 'http://localhost:3000',
          tools: ['test_tool'],
          icon: '🔧',
          trust: false,
          customHeaders: [],
          requestTimeout: 30000,
          connectionTimeout: 10000,
        },
        agent_id: '',
      };
    });

    it('should create new MCP server from form data', async () => {
      await createMCPServer(mockReq as MCPRequest, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          mcp_id: 'mcp_test_123',
          metadata: expect.objectContaining({
            name: 'Test MCP Server',
            description: 'A test MCP server',
            url: 'http://localhost:3000',
            tools: ['test_tool'],
            icon: '🔧',
            trust: false,
          }),
        }),
      );
    });

    it('should prevent duplicate server names', async () => {
      mockReq.body = {
        metadata: {
          name: 'Weather Service', // This name already exists in mock data
          url: 'http://localhost:3000',
        },
        agent_id: '',
      };

      await createMCPServer(mockReq as MCPRequest, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'MCP server already exists' });
    });

    it('should validate required fields', async () => {
      mockReq.body = {
        metadata: {
          description: 'A test MCP server',
          // Missing name and url
        },
        agent_id: '',
      };

      await createMCPServer(mockReq as MCPRequest, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Missing required fields: name and url are required',
      });
    });
  });

  describe('updateMCPServer', () => {
    beforeEach(() => {
      mockReq.body = {
        metadata: {
          name: 'Updated MCP Server',
          description: 'An updated MCP server',
          url: 'http://localhost:3001',
          tools: ['updated_tool'],
          icon: '⚙️',
          trust: true,
          customHeaders: [],
          requestTimeout: 45000,
          connectionTimeout: 15000,
        },
        agent_id: '',
      };
      mockReq.params = { mcp_id: 'mcp_weather_001' }; // Use existing mock server ID
    });

    it('should update existing MCP server', async () => {
      await updateMCPServer(mockReq as MCPParamsRequest, mockRes as Response);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          mcp_id: 'mcp_weather_001',
          metadata: expect.objectContaining({
            name: 'Updated MCP Server',
            description: 'An updated MCP server',
            url: 'http://localhost:3001',
            tools: ['updated_tool'],
            icon: '⚙️',
            trust: true,
          }),
        }),
      );
    });

    it('should reject updates to non-existent servers', async () => {
      mockReq.params = { mcp_id: 'non_existent_id' };

      await updateMCPServer(mockReq as MCPParamsRequest, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'MCP server not found' });
    });

    it('should validate required fields', async () => {
      mockReq.body = {
        metadata: {
          description: 'An updated MCP server',
          // Missing name and url
        },
        agent_id: '',
      };

      await updateMCPServer(mockReq as MCPParamsRequest, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Missing required fields: name and url are required',
      });
    });
  });

  describe('deleteMCPServer', () => {
    beforeEach(() => {
      mockReq.params = { mcp_id: 'mcp_weather_001' }; // Use existing mock server ID
    });

    it('should delete existing MCP server', async () => {
      await deleteMCPServer(mockReq as MCPParamsRequest, mockRes as Response);

      expect(mockRes.json).toHaveBeenCalledWith({ message: 'MCP server deleted successfully' });
    });

    it('should reject deletion of non-existent servers', async () => {
      mockReq.params = { mcp_id: 'non_existent_id' };

      await deleteMCPServer(mockReq as MCPParamsRequest, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'MCP server not found' });
    });
  });
});
