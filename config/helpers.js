/**
 * Helper functions
 * This allows us to give the console some colour when running in a terminal
 */
const readline = require("readline");

const askQuestion = (query) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) =>
    rl.question("\x1b[36m" + query + "\n> " + "\x1b[0m", (ans) => {
      rl.close();
      resolve(ans);
    })
  );
};

// Set the console colours
console.orange = (msg) => console.log('\x1b[33m%s\x1b[0m', msg);
console.green = (msg) => console.log('\x1b[32m%s\x1b[0m', msg);
console.red = (msg) => console.log('\x1b[31m%s\x1b[0m', msg);
console.blue = (msg) => console.log('\x1b[34m%s\x1b[0m', msg);
console.purple = (msg) => console.log('\x1b[35m%s\x1b[0m', msg);
console.cyan = (msg) => console.log('\x1b[36m%s\x1b[0m', msg);
console.yellow = (msg) => console.log('\x1b[33m%s\x1b[0m', msg);
console.white = (msg) => console.log('\x1b[37m%s\x1b[0m', msg);
console.gray = (msg) => console.log('\x1b[90m%s\x1b[0m', msg);

module.exports = {
  askQuestion,
}