const { exec } = require('child_process');

if (process.env.NODE_ENV !== 'CI') {
  exec('npx husky install', (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return;
    }
    console.log(`stdout: ${stdout}`);
    console.error(`stderr: ${stderr}`);
  });
}
