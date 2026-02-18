const express = require('express');
const axios = require('axios');
const profileAuth = require('../middleware/profileAuth');
const requireCEORole = require('../middleware/requireCEORole');

const router = express.Router();

// Ensure profile auth for all signage order routes
router.use(profileAuth);

const getApiBase = () => {
  const base = process.env.SIGNAGE_ORDERS_API_BASE || 'http://localhost:4000/api';
  return base.replace(/\/$/, '');
};

// Helper to forward requests to PDF Builder backend
const forwardRequest = async (method, path, req, res) => {
  try {
    const apiBase = getApiBase();

    const url = `${apiBase}${path}`;

    const headers = {
      // Identify the LibreChat user to the PDF Builder backend
      'X-User-Id': req.user?.id,
      // Optional: pass role hint based on attached profile when available
      'X-User-Role': req.userProfile?.profileType || undefined,
    };

    // Preserve query params and body
    const config = {
      method,
      url,
      headers,
      params: req.query,
      data: req.body,
    };

    const response = await axios(config);
    return res.status(response.status).json(response.data);
  } catch (error) {
    console.error('[signageOrders] Proxy error:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });

    const status = error.response?.status || 500;
    const data =
      error.response?.data || {
        error: 'SignageOrdersProxyError',
        message: 'Failed to contact Signage Orders API',
      };

    return res.status(status).json(data);
  }
};

/**
 * GET /api/signage/orders
 * CEO: list all orders, optional filters (?customerId=..., ?status=...)
 */
router.get('/orders', requireCEORole, async (req, res) => {
  return forwardRequest('get', '/orders', req, res);
});

/**
 * PATCH /api/signage/orders/:orderId
 * CEO: approve / reject, mark as paid, assign employee
 */
router.patch('/orders/:orderId', requireCEORole, async (req, res) => {
  const { orderId } = req.params;
  return forwardRequest('patch', `/orders/${orderId}`, req, res);
});

/**
 * GET /api/signage/my-orders
 * Employee: list orders assigned to current user
 */
router.get('/my-orders', async (req, res) => {
  // Hint to PDF Builder API to return only orders for this user
  req.query = { ...(req.query || {}), assignedTo: 'me' };
  return forwardRequest('get', '/orders', req, res);
});

/**
 * PATCH /api/signage/my-orders/:orderId/status
 * Employee: update status of an assigned order
 */
router.patch('/my-orders/:orderId/status', async (req, res) => {
  const { orderId } = req.params;
  return forwardRequest('patch', `/orders/${orderId}`, req, res);
});

module.exports = router;

