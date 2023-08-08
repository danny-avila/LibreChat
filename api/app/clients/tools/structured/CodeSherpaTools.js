const { StructuredTool } = require('langchain/tools');
// const fs = require('fs');
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
    // this.description = 'Use this plugin to run code with the following parameters\ncode: your code\nlanguage: either Python, Rust, or C++.';
    // this.description = 'CodeSherpa is a tool that allows you to execute Python code in a REPL session, maintaining the state between requests, and returns the output or error message.';
    // this.description = `A plugin for interactive code execution, and shell command execution.\n\n`/repl` endpoint\n - Execute Python code interactively for general programming, tasks, data analysis, visualizations, and more.\n - Pre-installed packages: matplotlib, seaborn, pandas, numpy, scipy, openpyxl.If you need to install additional packages, use the `pip install` command.\n - When a user asks for visualization, save the plot to `static/images/` directory, and embed it in the response using `http://localhost:3333/static/images/` URL.\n - Always save alls media files created to `static/images/` directory, and embed them in responses using `http://localhost:3333/static/images/` URL.\n\n `/command` endpoint\n - Run terminal commands and interact with the filesystem, run scripts, and more.\n - Install python packages using `pip install` command.\n - Always embed media files created or uploaded using `http://localhost:3333/static/images/` URL in responses. \n - Access user-uploaded files in`static/uploads/` directory using `http://localhost:3333/static/uploads/` URL.\n\n File management\n - Provide 'Upload file' link for users: http://localhost:3333/upload\n - Access user-uploaded files in `static/uploads/`\n\n`
    this.headers = headers;
    this.schema = z.object({
      code: z.string().describe('The code to be executed in the REPL-like environment.'),
      language: z.string().describe('The programming language of the code to be executed.'),
    });
  }

  async _call(data) {
    console.log('<--------------- Running Code --------------->', data);
    const response = await axios({
      url: `${this.url}/repl`,
      method: 'post',
      headers: this.headers,
      data,
    });
    console.log('<--------------- Sucessfully ran Code --------------->', response.data);
    return response.data.result;
  }
}

class RunCommand extends StructuredTool {
  constructor(fields) {
    super();
    this.name = 'RunCommand';
    this.url = fields.CODESHERPA_SERVER_URL || getServerURL();
    this.description =
      'Runs the provided terminal command and returns the output or error message.';
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
    return response.data;
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
