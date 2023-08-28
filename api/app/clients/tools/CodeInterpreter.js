const { Tool } = require('langchain/tools');
const WebSocket = require('ws');
const { promisify } = require('util');
const fs = require('fs');

class CodeInterpreter extends Tool {
  constructor() {
    super();
    this.name = 'code-interpreter';
    this.description = `If there is plotting or any image related tasks, save the result as .png file. 
    No need show the image or plot. USE print(variable_name) if you need output.You can run python codes with this plugin.You have to use print function in python code to get any result from this plugin. 
    This does not support user input. Even if the code has input() function, change it to an appropriate value.
    You can show the user the code with input() functions. But the code passed to the plug-in should not contain input().
    You should provide properly formatted code to this plugin. If the code is executed successfully, the stdout will be returned to you. You have to print that to the user, and if the user had 
    asked for an explanation, you have to provide one. If the output is "Error From here" or any other error message, 
    tell the user "Python Engine Failed" and continue with whatever you are supposed to do.`;

    // Create a promisified version of fs.unlink
    this.unlinkAsync = promisify(fs.unlink);
  }

  async _call(input) {
    const websocket = new WebSocket('ws://localhost:3380'); // Update with your WebSocket server URL

    // Wait until the WebSocket connection is open
    await new Promise((resolve) => {
      websocket.onopen = resolve;
    });

    // Send the Python code to the server
    websocket.send(input);

    // Wait for the result from the server
    const result = await new Promise((resolve) => {
      websocket.onmessage = (event) => {
        resolve(event.data);
      };

      // Handle WebSocket connection closed
      websocket.onclose = () => {
        resolve('Python Engine Failed');
      };
    });

    // Close the WebSocket connection
    websocket.close();

    return result;
  }
}

module.exports = CodeInterpreter;
