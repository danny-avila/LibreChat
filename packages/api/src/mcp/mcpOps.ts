import { MCP } from 'librechat-data-provider';
import { Response } from 'express';

export const addTool = (req: { body: MCP }, res: Response) => {
  console.log('CREATE MCP:', JSON.stringify(req.body, null, 2));
  res.send('ok');
};

export const updateTool = (req: { body: MCP; params: { mcp_id: string } }, res: Response) => {
  console.log('UPDATE MCP:', req.params.mcp_id, JSON.stringify(req.body, null, 2));
  res.send('ok');
};

export const deleteTool = (req: { params: { mcp_id: string } }, res: Response) => {
  console.log('DELETE MCP:', req.params.mcp_id);
  res.send('ok');
};
