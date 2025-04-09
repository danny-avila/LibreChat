# E2BCode Plugin for LibreChat

## Overview

The **E2BCode Plugin** integrates the capabilities of the [E2B Code Interpreter](https://e2b.dev/) into [LibreChat](https://librechat.ai/), allowing users to execute code, run shell commands, manage files, and more within an isolated sandbox environment directly from the chat interface. This plugin leverages the E2B SDK and is built as a LangChain plugin.

## Features

- **Isolated Sandboxing**: Run code and commands in a secure, isolated sandbox.
- **Code Execution**: Supports execution of code in Python, JavaScript, TypeScript, and Shell.
- **File Management**: Read from and write to files within the sandbox.
- **Package Installation**: Install packages using `pip` or `npm`.
- **Environment Variables**: Set environment variables for sandbox environments and executions.
- **Background Processes**: Run and manage background shell commands.
- **Timeout Management**: Configure and adjust sandbox timeouts.

---

## Prerequisites

- **LibreChat** installed and running.
- **Node.js** (version 14.x or higher).
- **E2B API Key**: Sign up at [E2B](https://e2b.dev/) to obtain an API key.

---

## Installation and Configuration

### 1. Clone the Repository


### 2. Set Environment Variables

Create a `.env` file in the plugin directory or set environment variables in your system. The plugin requires the following environment variables:

- `E2B_API_KEY`: Your E2B API key.
- Any environment variables that start with `E2B_CODE_EV_` will be passed to the sandbox without being revealed to the LLM. For example, to pass a variable `SECRET_KEY`, you would set `E2B_CODE_EV_SECRET_KEY`.

Example `.env` file:

```dotenv
E2B_API_KEY=your_e2b_api_key
E2B_CODE_EV_SECRET_KEY=your_secret_value
```

---

## Usage Instructions

### Overview

The E2BCode plugin allows you to interact with an isolated sandbox environment directly from LibreChat. You can perform various actions such as creating sandboxes, executing code, running shell commands, managing files, installing packages, and more.

### General Workflow

1. **Create a Sandbox**: Before executing any code or commands, you need to create a new sandbox environment.
2. **Perform Actions**: Use the various actions provided by the plugin to interact with the sandbox.
3. **Manage Sandbox**: Adjust the sandbox timeout or kill the sandbox when done.

### Available Actions

Below are the actions you can perform, along with the required parameters:

1. **create**

   - **Purpose**: Create a new sandbox environment.
   - **Parameters**:
     - `sessionId` (required): A unique identifier to maintain session state.
     - `timeout` (optional): Timeout in minutes for the sandbox environment (default is 60 minutes).
     - `envs` (optional): Environment variables to set when creating the sandbox.
   - **Example**:

     ```json
     {
       "action": "create",
       "sessionId": "unique_session_id",
       "timeout": 120,
       "envs": { "MY_VAR": "my_value" }
     }
     ```

2. **list_sandboxes**

   - **Purpose**: List all active sandboxes.
   - **Parameters**: Only `action` parameter.
   - **Example**:

     ```json
     {
       "action": "list_sandboxes"
     }
     ```

3. **set_timeout**

   - **Purpose**: Change the timeout of an existing sandbox.
   - **Parameters**:
     - `sessionId` (required)
     - `timeout` (required): New timeout in minutes.
   - **Example**:

     ```json
     {
       "action": "set_timeout",
       "sessionId": "unique_session_id",
       "timeout": 180
     }
     ```

4. **kill**

   - **Purpose**: Terminate an existing sandbox.
   - **Parameters**:
     - `sessionId` (required)
   - **Example**:

     ```json
     {
       "action": "kill",
       "sessionId": "unique_session_id"
     }
     ```

5. **execute**

   - **Purpose**: Execute code within the sandbox.
   - **Parameters**:
     - `sessionId` (required)
     - `code` (required): The code to execute.
     - `language` (optional): Programming language (`"python"`, `"javascript"`, `"typescript"`, `"shell"`). Defaults to `"python"`.
     - `envs` (optional): Environment variables for the execution.
   - **Example**:

     ```json
     {
       "action": "execute",
       "sessionId": "unique_session_id",
       "code": "import os; print(os.environ.get('MY_VAR'))",
       "language": "python",
       "envs": { "MY_VAR": "value" }
     }
     ```

6. **shell**

   - **Purpose**: Run a shell command within the sandbox.
   - **Parameters**:
     - `sessionId` (required)
     - `command` (required): The shell command to execute.
     - `background` (optional): Whether to run the command in the background. Defaults to `false`.
     - `envs` (optional)
   - **Example (foreground)**:

     ```json
     {
       "action": "shell",
       "sessionId": "unique_session_id",
       "command": "ls -la"
     }
     ```

   - **Example (background)**:

     ```json
     {
       "action": "shell",
       "sessionId": "unique_session_id",
       "command": "python app.py > output.log",
       "background": true
     }
     ```

7. **kill_command**

   - **Purpose**: Terminate a background command.
   - **Parameters**:
     - `sessionId` (required)
     - `commandId` (required): The ID of the background command to kill.
   - **Example**:

     ```json
     {
       "action": "kill_command",
       "sessionId": "unique_session_id",
       "commandId": "command_id_from_background_command"
     }
     ```

8. **write_file**

   - **Purpose**: Write content to a file in the sandbox.
   - **Parameters**:
     - `sessionId` (required)
     - `filePath` (required): Path to the file.
     - `fileContent` (required): Content to write.
   - **Example**:

     ```json
     {
       "action": "write_file",
       "sessionId": "unique_session_id",
       "filePath": "/home/user/test.txt",
       "fileContent": "Hello, world!"
     }
     ```

9. **read_file**

   - **Purpose**: Read content from a file in the sandbox.
   - **Parameters**:
     - `sessionId` (required)
     - `filePath` (required): Path to the file.
   - **Example**:

     ```json
     {
       "action": "read_file",
       "sessionId": "unique_session_id",
       "filePath": "/home/user/test.txt"
     }
     ```

10. **install**

    - **Purpose**: Install a package within the sandbox.
    - **Parameters**:
      - `sessionId` (required)
      - `code` (required): Name of the package to install.
      - `language` (optional): Programming language (`"python"`, `"javascript"`, `"typescript"`). Defaults to `"python"`.
      - `envs` (optional)
    - **Example**:

      ```json
      {
        "action": "install",
        "sessionId": "unique_session_id",
        "code": "requests",
        "language": "python"
      }
      ```

11. **get_file_downloadurl**

    - **Purpose**: Generate a download URL for a file in the sandbox.
    - **Parameters**:
      - `sessionId` (required)
      - `filePath` (required): Path to the file.
    - **Example**:

      ```json
      {
        "action": "get_file_downloadurl",
        "sessionId": "unique_session_id",
        "filePath": "/home/user/output.txt"
      }
      ```

12. **get_host**

    - **Purpose**: Get the host and port for accessing a service running in the sandbox.
    - **Parameters**:
      - `sessionId` (required)
      - `port` (required): Port number used by the service.
    - **Example**:

      ```json
      {
        "action": "get_host",
        "sessionId": "unique_session_id",
        "port": 8080
      }
      ```

### Steps to Use the Plugin in LibreChat

1. **Start a New Conversation**

   Open LibreChat and start a new conversation with the assistant.

2. **Initialize Session**

   Begin by creating a sandbox:

   ```json
   {
     "action": "create",
     "sessionId": "my_unique_session_id",
     "timeout": 60
   }
   ```

3. **Perform Actions**

   Use any of the available actions to interact with the sandbox. Ensure you include the same `sessionId` used when creating the sandbox.

   **Example - Execute Code:**

   ```json
   {
     "action": "execute",
     "sessionId": "my_unique_session_id",
     "code": "print('Hello from the sandbox!')"
   }
   ```

4. **View Responses**

   The plugin will return the output or result of the action, which will be displayed in the chat interface.

5. **Terminate Sandbox**

   When finished, you can kill the sandbox to free up resources:

   ```json
   {
     "action": "kill",
     "sessionId": "my_unique_session_id"
   }
   ```

### Notes on Environment Variables

- **Passing Hidden Environment Variables**:

  Any environment variable set on the host system that starts with `E2B_CODE_EV_` will be passed to the sandbox without being revealed to the LLM. The prefix `E2B_CODE_EV_` is stripped when passed to the sandbox.

  - **Example**: If you set `E2B_CODE_EV_SECRET_KEY=supersecret`, the sandbox will have an environment variable `SECRET_KEY` set to `supersecret`.

- **Setting Environment Variables in Actions**:

  You can also pass `envs` in actions to set environment variables for specific executions.

### Error Handling

- **Error Responses**:

  If an error occurs while executing an action, you will receive a response containing an `error` message and `success` set to `false`.

  - **Example**:

    ```json
    {
      "sessionId": "my_unique_session_id",
      "error": "Code is required for `execute` action.",
      "success": false
    }
    ```

- **Success Indicator**:

  Check the `success` field in the response to determine if the action was successful.

### Background Commands and Hosting Services

- **Running Services**:

  To run services like Flask or Node.js servers, use the `shell` action with `background` set to `true` and redirect output to a log file.

- **Example**:

  ```json
  {
    "action": "shell",
    "sessionId": "my_unique_session_id",
    "command": "python app.py > output.log",
    "background": true
  }
  ```

- **Accessing the Service**:

  Use the `get_host` action to retrieve the host and port to access the running service.

  ```json
  {
    "action": "get_host",
    "sessionId": "my_unique_session_id",
    "port": 5000
  }
  ```

---

## Best Practices

- **Unique Session IDs**: Always use unique and consistent `sessionId` values for your sessions.
- **Security**: Do not expose sensitive information directly in requests. Use the hidden environment variables feature to securely pass secrets.
- **Resource Management**: Remember to kill sandboxes when they are no longer needed to free up resources.

---

## Troubleshooting

- **Sandbox Not Found**:

  If you receive an error stating that the sandbox was not found, ensure that you have created a sandbox and are using the correct `sessionId`.

- **Timeouts**:

  If actions are not completing, check if the sandbox has expired due to the timeout. Increase the timeout if necessary using the `set_timeout` action.

- **Permissions**:

  Ensure that LibreChat has the necessary permissions and configurations to run plugins and access environment variables.

---

## Support

For issues related to the E2BCode plugin, please open an issue on the plugin's repository: [GitHub Repository](https://github.com/jmaddington/libreChat/issues)

For issues related to LibreChat, visit [LibreChat Support](https://librechat.ai) or consult their Discord.

---

## Contributing

Contributions are welcome! Fork the repository and submit a pull request with your changes.

---

## Acknowledgments

- **E2B**: For providing the E2B Code Interpreter SDK.
- **LibreChat**: For the chat platform that makes this integration possible.

---

Feel free to reach out if you have any questions or need assistance with setup and usage.
