const { StructuredTool } = require('langchain/tools');
const axios = require('axios');
const { z } = require('zod');

function getServerURL() {
  const url = process.env.CODESHERPA_SERVER_URL || '';
  if (!url) {
    throw new Error('Missing CODESHERPA_SERVER_URL environment variable.');
  }
  return url;
}

const headers = {
  'Content-Type': 'application/json',
};

class RunCode extends StructuredTool {
  constructor(fields) {
    super();
    this.name = 'RunCode';
    this.url = fields.CODESHERPA_SERVER_URL || getServerURL();
    this.description_for_model = `// Run code: provide "code" and "language"
// A plugin for interactive code execution
// Execute Python code interactively for general programming, tasks, data analysis, visualizations, and more.
// Pre-installed packages: matplotlib, seaborn, pandas, numpy, scipy, openpyxl.If you need to install additional packages, use the \`pip install\` command.
// When a user asks for visualization, save the plot to \`static/images/\` directory, and embed it in the response using \`${this.url}/static/images/\` URL.
// Always save alls media files created to \`static/images/\` directory, and embed them in responses using \`${this.url}/static/images/\` URL.
// Always embed media files created or uploaded using \`${this.url}/static/images/\` URL in responses.
// Access user-uploaded files in\`static/uploads/\` directory using \`${this.url}/static/uploads/\` URL.
// Remember to save any plots/images created, so you can embed it in the response, to \`static/images/\` directory, and embed them as instructed before.`;
    this.description = `This plugin allows interactive code execution.

- Always provide code as such: {"code": "print('Hello World!')"}
- Always use this plugin when you are asked to write code so you can test and execute it in a safe environment.
- Python has pre-installed packages: matplotlib, seaborn, pandas, numpy, scipy, openpyxl. Additional ones can be installed via pip with RunCommand.
- When a user asks for visualization, save the plot to \`static/images/\` directory, and embed it in the response using \`${this.url}/static/images/\` URL.
- Remember to save any plots/images created, so you can embed it in the response, to \`static/images/\` directory, and embed them as instructed before.
`;
    this.headers = headers;
    this.schema = z.object({
      code: z.string().optional().describe('The code to be executed in the REPL-like environment.'),
      language: z
        .string()
        .optional()
        .describe('The programming language of the code to be executed.'),
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
  constructor(fields) {
    super();
    this.name = 'RunCommand';
    this.url = fields.CODESHERPA_SERVER_URL || getServerURL();
    this.description_for_model = `// Run command: provide "command" only
// Run terminal commands and interact with the filesystem, run scripts, and more.
// Install python packages using \`pip install\` command.
// Always embed media files created or uploaded using \`${this.url}/static/images/\` URL in responses.
// Access user-uploaded files in\`static/uploads/\` directory using \`${this.url}/static/uploads/\` URL.`;
    this.description = `A plugin for interactive shell command execution.
- Run terminal commands and interact with the filesystem, run scripts, and more.
- Install python packages using \`pip install\` command.
- Always embed media files created or uploaded using \`${this.url}/static/images/\` URL in responses.`;
    this.headers = headers;
    this.schema = z.object({
      command: z.string().describe('The terminal command to be executed.'),
    });
  }

  async _call(data) {
    const response = await axios({
      url: `${this.url}/command`,
      method: 'post',
      headers: this.headers,
      data,
    });
    return response.data.result;
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

module.exports = [
  RunCode,
  RunCommand,
  // UploadFile
];
