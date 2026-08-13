const express = require('express');

function mountClerkWebhook(app, routes) {
  app.post('/api/auth/clerk/webhook', express.raw({ type: 'application/json' }), routes.clerk);
}

module.exports = mountClerkWebhook;
