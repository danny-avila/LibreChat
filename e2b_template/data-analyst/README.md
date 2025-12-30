# data-analyst - E2B Sandbox Template

This is an E2B sandbox template that allows you to run code in a controlled environment.

## Prerequisites

Before you begin, make sure you have:
- An E2B account (sign up at [e2b.dev](https://e2b.dev))
- Your E2B API key (get it from your [E2B dashboard](https://e2b.dev/dashboard))
- Node.js and npm/yarn (or similar) installed

## Configuration

1. Create a `.env` file in your project root or set the environment variable:
   ```
   E2B_API_KEY=your_api_key_here
   ```

## Installing Dependencies

```bash
npm install e2b
```

## Building the Template

```bash
# For development
npm run e2b:build:dev

# For production
npm run e2b:build:prod
```

## Using the Template in a Sandbox

Once your template is built, you can use it in your E2B sandbox:

```typescript
import { Sandbox } from 'e2b'

// Create a new sandbox instance
const sandbox = await Sandbox.create('data-analyst')

// Your sandbox is ready to use!
console.log('Sandbox created successfully')
```

## Template Structure

- `template.ts` - Defines the sandbox template configuration
- `build.dev.ts` - Builds the template for development
- `build.prod.ts` - Builds the template for production

## Next Steps

1. Customize the template in `template.ts` to fit your needs
2. Build the template using one of the methods above
3. Use the template in your E2B sandbox code
4. Check out the [E2B documentation](https://e2b.dev/docs) for more advanced usage