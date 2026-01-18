const express = require('express');
const router = express.Router();

const appleAppSiteAssociation = {
  webcredentials: {
    apps: ['D3EV6B5WZE.com.librechat.ios'],
  },
  applinks: {
    apps: [],
    details: [
      {
        appID: 'D3EV6B5WZE.com.librechat.ios',
        paths: ['*'],
      },
    ],
  },
};

router.get('/apple-app-site-association', (req, res) => {
  res.set('Content-Type', 'application/json');
  res.json(appleAppSiteAssociation);
});

module.exports = router;
