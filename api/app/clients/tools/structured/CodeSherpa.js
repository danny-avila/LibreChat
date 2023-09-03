const { StructuredTool } = require('langchain/tools');
const axios = require('axios');
const { z } = require('zod');

const headers = {
  'Content-Type': 'application/json',
};

function getServerURL() {
  const url = process.env.CODESHERPA_SERVER_URL || '';
  if (!url) {
    throw new Error('Missing CODESHERPA_SERVER_URL environment variable.');
  }
  return url;
}

class RunCode extends StructuredTool {
  constructor() {
    super();
    this.name = 'RunCode';
    this.description =
      'Use this plugin to run code with the following parameters\ncode: your code\nlanguage: either Python, Rust, or C++.';
    this.headers = headers;
    this.schema = z.object({
      code: z.string().describe('The code to be executed in the REPL-like environment.'),
      language: z.string().describe('The programming language of the code to be executed.'),
    });
  }

  async _call({ code, language = 'python' }) {
    // console.log('<--------------- Running Code --------------->', { code, language });
    const response = await axios({
      url: `${this.url}/repl`,
      method: 'post',
      headers: this.headers,
      data: { code, language },
    });
    // console.log('<--------------- Sucessfully ran Code --------------->', response.data);
    return response.data.result;
  }
}

class RunCommand extends StructuredTool {
  constructor() {
    super();
    this.name = 'RunCommand';
    this.description =
      'Runs the provided terminal command and returns the output or error message.';
    this.headers = headers;
    this.schema = z.object({
      command: z.string().describe('The terminal command to be executed.'),
    });
  }

  async _call({ command }) {
    const response = await axios({
      url: `${this.url}/command`,
      method: 'post',
      headers: this.headers,
      data: {
        command,
      },
    });
    return response.data.result;
  }
}

class CodeSherpa extends StructuredTool {
  constructor(fields) {
    super();
    this.name = 'CodeSherpa';
    this.url = fields.CODESHERPA_SERVER_URL || getServerURL();
    //     this.description = `A plugin for interactive code execution, and shell command execution.

    // Run code: provide "code" and "language"
    // - Execute Python code interactively for general programming, tasks, data analysis, visualizations, and more.
    // - Pre-installed packages: matplotlib, seaborn, pandas, numpy, scipy, openpyxl. If you need to install additional packages, use the \`pip install\` command.
    // - When a user asks for visualization, save the plot to \`static/images/\` directory, and embed it in the response using \`http://localhost:3333/static/images/\` URL.
    // - Always save all media files created to \`static/images/\` directory, and embed them in responses using \`http://localhost:3333/static/images/\` URL.

    // Run command: provide "command" only
    // - Run terminal commands and interact with the filesystem, run scripts, and more.
    // - Install python packages using \`pip install\` command.
    // - Always embed media files created or uploaded using \`http://localhost:3333/static/images/\` URL in responses.
    // - Access user-uploaded files in \`static/uploads/\` directory using \`http://localhost:3333/static/uploads/\` URL.`;
    this.description = `This plugin allows interactive code and shell command execution. 

    To run code, supply "code" and "language". Python has pre-installed packages: matplotlib, seaborn, pandas, numpy, scipy, openpyxl. Additional ones can be installed via pip.
    
    To run commands, provide "command" only. This allows interaction with the filesystem, script execution, and package installation using pip. Created or uploaded media files are embedded in responses using a specific URL.`;
    this.schema = z.object({
      code: z
        .string()
        .optional()
        .describe(
          `The code to be executed in the REPL-like environment. You must save all media files created to \`${this.url}/static/images/\` and embed them in responses with markdown`,
        ),
      language: z
        .string()
        .optional()
        .describe(
          'The programming language of the code to be executed, you must also include code.',
        ),
      command: z
        .string()
        .optional()
        .describe(
          'The terminal command to be executed. Only provide this if you want to run a command instead of code.',
        ),
    });

    this.RunCode = new RunCode({ url: this.url });
    this.RunCommand = new RunCommand({ url: this.url });
    this.runCode = this.RunCode._call.bind(this);
    this.runCommand = this.RunCommand._call.bind(this);
  }

  async _call({ code, language, command }) {
    if (code?.length > 0) {
      return await this.runCode({ code, language });
    } else if (command) {
      return await this.runCommand({ command });
    } else {
      return 'Invalid parameters provided.';
    }
  }
}

/* TODO: support file upload */
// class UploadFile extends StructuredTool {
//   constructor(fields) {
//     super();
//     this.name = 'UploadFile';
//     this.url = fields.CODESHERPA_SERVER_URL || getServerURL();
//     this.description = 'Endpoint to upload a file.';
//     this.headers = headers;
//     this.schema = z.object({
//       file: z.string().describe('The file to be uploaded.'),
//     });
//   }

//   async _call(data) {
//     const formData = new FormData();
//     formData.append('file', fs.createReadStream(data.file));

//     const response = await axios({
//       url: `${this.url}/upload`,
//       method: 'post',
//       headers: {
//         ...this.headers,
//         'Content-Type': `multipart/form-data; boundary=${formData._boundary}`,
//       },
//       data: formData,
//     });
//     return response.data;
//   }
// }

// module.exports = [
//   RunCode,
//   RunCommand,
//   // UploadFile
// ];

module.exports = CodeSherpa;
