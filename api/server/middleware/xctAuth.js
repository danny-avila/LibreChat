/**
 * XCT-Auth Middleware
 * Unified authentication middleware for Xcity projects
 * Connects to XCT-Auth service on Railway (xct-litellm.up.railway.app)
 */

const jwt = require('jsonwebtoken');
const axios = require('axios');

const XCT_AUTH_URL = process.env.XCT_AUTH_URL || 'https://xct-litellm.up.railway.app';
const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret';

/**
 * Middleware to validate JWT token from XCT-Auth service
 */
const requireXctAuth = async (req, res, next) => {
  try {
    // Check for token in Authorization header or cookie
    const token = req.headers.authorization?.split(' ')[1] || req.cookies?.['xct-auth-token'];
    
    if (!token) {
      return res.status(401).json({ 
        message: 'No authentication token provided',
        error: 'UNAUTHORIZED'
      });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Validate token with XCT-Auth service
    const validation = await validateXctToken(token);
    
    if (!validation.valid) {
      return res.status(401).json({ 
        message: 'Invalid or expired token',
        error: 'TOKEN_INVALID'
      });
    }

    // Attach user to request object
    req.user = decoded.user;
    req.token = token;
    
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        message: 'Token expired',
        error: 'TOKEN_EXPIRED'
      });
    }
    
    console.error('XCT-Auth validation error:', error);
    return res.status(401).json({ 
      message: 'Authentication failed',
      error: 'AUTH_FAILED'
    });
  }
};

/**
 * Optional authentication - doesn't fail if no token
 */
const optionalXctAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1] || req.cookies?.['xct-auth-token'];
    
    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET);
      const validation = await validateXctToken(token);
      
      if (validation.valid) {
        req.user = decoded.user;
        req.token = token;
      }
    }
    
    next();
  } catch (error) {
    // Silently continue without user context
    next();
  }
};

/**
 * Validate token with XCT-Auth service
 */
const validateXctToken = async (token) => {
  try {
    const response = await axios.get(`${XCT_AUTH_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    return {
      valid: true,
      user: response.data
    };
  } catch (error) {
    return {
      valid: false,
      error: error.response?.data || error.message
    };
  }
};

/**
 * Refresh access token using refresh token
 */
const refreshXctToken = async (refreshToken) => {
  try {
    const response = await axios.post(`${XCT_AUTH_URL}/auth/refresh`, {
      refreshToken
    });
    
    return {
      token: response.data.token,
      refreshToken: response.data.refreshToken,
      user: response.data.user
    };
  } catch (error) {
    throw new Error('Failed to refresh token: ' + error.message);
  }
};

/**
 * Login with XCT-Auth service
 */
const loginWithXctAuth = async (email, password) => {
  try {
    const response = await axios.post(`${XCT_AUTH_URL}/auth/login`, {
      email,
      password
    });
    
    return {
      success: true,
      user: response.data.user,
      token: response.data.token,
      refreshToken: response.data.refreshToken
    };
  } catch (error) {
    throw new Error('Login failed: ' + error.response?.data?.message || error.message);
  }
};

/**
 * Register with XCT-Auth service
 */
const registerWithXctAuth = async (email, password, name) => {
  try {
    const response = await axios.post(`${XCT_AUTH_URL}/auth/register`, {
      email,
      password,
      name
    });
    
    return {
      success: true,
      user: response.data.user,
      token: response.data.token,
      refreshToken: response.data.refreshToken
    };
  } catch (error) {
    throw new Error('Registration failed: ' + error.response?.data?.message || error.message);
  }
};

module.exports = {
  requireXctAuth,
  optionalXctAuth,
  refreshXctToken,
  loginWithXctAuth,
  registerWithXctAuth,
  validateXctToken
};
