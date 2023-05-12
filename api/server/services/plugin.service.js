const fs = require("fs");

const getAvailableTools = async () => {
  try {
    const manifest = JSON.parse(fs.readFileSync("../../app/langchain/tools/manifest.json", "utf8"));
    console.log(manifest);
    return manifest;
  }
  catch (error) {
    console.log(error);
    return error;
  }
};