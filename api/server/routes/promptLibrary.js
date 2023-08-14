const express = require('express');
const router = express.Router();
const requireJwtAuth = require('../../middleware/requireJwtAuth');
const { collatePromptLibrary } = require('../../lib/utils/PromptLibrary');

router.get('/', requireJwtAuth, async (req, res) => {
  // Original non-search version
  return res.status(200).send(collatePromptLibrary());

  // TODO: Enable MeiliSearch below, using instantseach.js
  /*try {
    res.status(200).send({
      key: await getSearchKey()
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Couldn\'t connect to search, is it enabled?' });
  }*/
});

module.exports = router;
