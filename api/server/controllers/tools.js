const { EnvVar } = require('@librechat/agents');
const { Tools } = require('librechat-data-provider');
const { loadAuthValues } = require('~/app/clients/tools/util');

const fieldsMap = {
  [Tools.execute_code]: [EnvVar.CODE_API_KEY],
};

/**
 * @param {ServerRequest} req - The request object, containing information about the HTTP request.
 * @param {ServerResponse} res - The response object, used to send back the desired HTTP response.
 * @returns {Promise<void>} A promise that resolves when the function has completed.
 */
const verifyToolAuth = async (req, res) => {
  try {
    const { toolId } = req.params;
    const authFields = fieldsMap[toolId];
    if (!authFields) {
      res.status(404).json({ message: 'Tool not found' });
      return;
    }
    const result = await loadAuthValues({
      userId: req.user.id,
      authFields,
    });
    for (const field of authFields) {
      if (!result[field]) {
        res.status(200).json({ authenticated: false });
        return;
      }
    }
    res.status(200).json({ authenticated: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  verifyToolAuth,
};
