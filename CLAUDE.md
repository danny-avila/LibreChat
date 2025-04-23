# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Structure
- **/api** - Backend (Node.js/Express)
- **/client** - Frontend (React/TypeScript)
- **/packages** - Shared libraries
- **/config** - Configuration scripts
- **/e2e** - End-to-end tests

## Build & Test Commands
- Setup: `npm ci` (install dependencies)
- Start backend: `npm run backend:dev` or `npm run b:api:dev` (using Bun)
- Start frontend: `npm run frontend:dev` or `npm run b:client:dev` (using Bun)
- Run API tests: `npm run test:api` or `npm run b:test:api` (using Bun)
  - Note: API tests are expected to fail locally due to CI configuration
  - For local testing: Add `NODE_ENV=CI` to `/api/.env`
- Run client tests: `npm run test:client` or `npm run b:test:client` (using Bun)
- Run single test: `cd api && npx jest path/to/test.spec.js -t "test name"`
- E2E tests: `npm run e2e` or `npm run e2e:headed` (with UI)
- Lint code: `npm run lint` or `npm run lint:fix` (to auto-fix issues)
- Format code: `npm run format`

## Code Style Guidelines
- Follow Airbnb JavaScript Style Guide
- Indentation: 2 spaces
- Line length: Max 120 characters
- Quotes: Single quotes
- Semicolons: Required
- Curly braces: Required for all blocks
- TypeScript for client-side, JavaScript (CommonJS) for server-side
- File naming:
  - PascalCase for components, controllers, and models
  - Controller files: append "Controller"
  - Service files: append "Service"
- API structure follows RESTful conventions
  - Routes
  - Controllers
  - Services
  - Models
- Proper error handling with try-catch blocks and specific error messages
- Use i18next for user-facing strings
- State management: Recoil for global state

## Testing Guidelines
- Jest for unit testing
- Supertest for API integration tests
- Playwright for E2E testing
- Write descriptive test names
- Run both client and API tests before submitting changes

## Creating Tools
To create a new tool in LibreChat:

1. Create a new tool file in `/api/app/clients/tools/structured/` extending the `Tool` class:
   ```javascript
   const { Tool } = require('@langchain/core/tools');
   const { z } = require('zod');
   
   class MyTool extends Tool {
     name = 'my_tool_key';
     description = 'Description of what the tool does';
     
     // Define the schema for input validation
     schema = z.object({
       action: z.enum(['action1', 'action2']),
       param1: z.string(),
       param2: z.number().optional(),
     });
     
     constructor(fields = {}) {
       super();
       // Store API keys and credentials
       this.apiKey = fields.MY_API_KEY || process.env.MY_API_KEY;
     }
     
     async _call(args) {
       // Implement the tool's functionality
       // Return results as a string or JSON string
     }
   }
   
   module.exports = MyTool;
   ```

2. Add your tool to `/api/app/clients/tools/index.js`:
   ```javascript
   const MyTool = require('./structured/MyTool');
   
   // In the exports section:
   module.exports = {
     // ...existing exports
     MyTool,
   };
   ```

3. Add your tool to the tool constructors in `/api/app/clients/tools/util/handleTools.js`:
   ```javascript
   const toolConstructors = {
     // ...existing constructors
     my_tool_key: MyTool,
   };
   ```

4. Register your tool in `/api/app/clients/tools/manifest.json`:
   ```json
   {
     "name": "My Tool",
     "pluginKey": "my_tool_key",
     "description": "Description for users about what this tool does",
     "icon": "/assets/my-tool-icon.png",
     "authConfig": [
       {
         "authField": "MY_API_KEY",
         "label": "API Key",
         "description": "Enter your API key from..."
       }
     ]
   }
   ```