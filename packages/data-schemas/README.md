# `@librechat/data-schemas`

Mongoose schemas and models for LibreChat. This package provides a comprehensive collection of Mongoose schemas used across the LibreChat project, enabling robust data modeling and validation for various entities such as actions, agents, messages, users, and more.


## Features

- **Modular Schemas:** Includes schemas for actions, agents, assistants, balance, banners, categories, conversation tags, conversations, files, keys, messages, plugin authentication, presets, projects, prompts, prompt groups, roles, sessions, shared links, tokens, tool calls, transactions, and users.
- **TypeScript Support:** Provides TypeScript definitions for type-safe development.
- **Ready for Mongoose Integration:** Easily integrate with Mongoose to create models and interact with your MongoDB database.
- **Flexible & Extensible:** Designed to support the evolving needs of LibreChat while being adaptable to other projects.


## Installation

Install the package via npm or yarn:

```bash
npm install @librechat/data-schemas
```

Or with yarn:

```bash
yarn add @librechat/data-schemas
```


## Usage

After installation, you can import and use the schemas in your project. For example, to create a Mongoose model for a user:

```js
import mongoose from 'mongoose';
import { userSchema } from '@librechat/data-schemas';

const UserModel = mongoose.model('User', userSchema);

// Now you can use UserModel to create, read, update, and delete user documents.
```

You can also import other schemas as needed:

```js
import { actionSchema, agentSchema, messageSchema } from '@librechat/data-schemas';
```

Each schema is designed to integrate seamlessly with Mongoose and provides indexes, timestamps, and validations tailored for LibreChat’s use cases.


## Development

This package uses Rollup and TypeScript for building and bundling.

### Available Scripts

- **Build:**  
  Cleans the `dist` directory and builds the package.
  ```bash
  npm run build
  ```

- **Build Watch:**  
  Rebuilds automatically on file changes.
  ```bash
  npm run build:watch
  ```

- **Test:**  
  Runs tests with coverage in watch mode.
  ```bash
  npm run test
  ```

- **Test (CI):**  
  Runs tests with coverage for CI environments.
  ```bash
  npm run test:ci
  ```

- **Verify:**  
  Runs tests in CI mode to verify code integrity.
  ```bash
  npm run verify
  ```

- **Clean:**  
  Removes the `dist` directory.
  ```bash
  npm run clean
  ```

For those using Bun, equivalent scripts are available:
- **Bun Clean:** `bun run b:clean`
- **Bun Build:** `bun run b:build`


## Repository & Issues

The source code is maintained on GitHub.
- **Repository:** [LibreChat Repository](https://github.com/danny-avila/LibreChat.git)
- **Issues & Bug Reports:** [LibreChat Issues](https://github.com/danny-avila/LibreChat/issues)


## License

This project is licensed under the [MIT License](LICENSE).


## Contributing

Contributions to improve and expand the data schemas are welcome. If you have suggestions, improvements, or bug fixes, please open an issue or submit a pull request on the [GitHub repository](https://github.com/danny-avila/LibreChat/issues).

For more detailed documentation on each schema and model, please refer to the source code or visit the [LibreChat website](https://librechat.ai).
