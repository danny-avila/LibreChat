import { MCP } from 'librechat-data-provider';
import { Response } from 'express';

// just log the request
export const addTool = (req: { body: MCP }, res: Response) => {
  console.log(JSON.stringify(req.body, null, 2));
  res.send('ok');
};
