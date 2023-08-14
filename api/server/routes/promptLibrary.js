const express = require('express');
const router = express.Router();
const requireJwtAuth = require('../../middleware/requireJwtAuth');
const { collatePromptLibrary, getSearchKey } = require('../../lib/utils/PromptLibrary');

router.get('/', requireJwtAuth, async (req, res) => {
  const library = collatePromptLibrary();
  const key = await getSearchKey();

  // TODO: check if SEARCH is enabled, if not just pass the library and they can deal with it

  res.status(200).send({
    library,
    key,
  });
});

module.exports = router;
