const { getAvailableTools } = require("../services/plugin.service");

const getAvailableToolsController = async (req, res) => {
  try {
    const tools = await getAvailableTools();
    res.status(200).send({ tools });
  }
  catch (err) {
    console.log(err);
    return res.status(500).json({ message: err.message });
  }
}