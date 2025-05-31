const express = require('express');
const { checkBan, registerLimiter } = require('~/server/middleware');
const User = require('~/models/User');
const { logger } = require('~/config');
const bcrypt = require('bcryptjs');

const router = express.Router();

/**
 * Creates a guest user with random credentials
 * @route POST /guest
 * @returns {Object} 201 - success response with user data - application/json
 * @returns {Object} 400 - error response - application/json
 * @returns {Object} 500 - server error response - application/json
 */
const createGuestUser = async (req, res) => {
  try {
    let randomSuffix;
    let username;
    let counter = 0;
    do {
      counter++;
      // Generate random 6-digit number for username and password
      randomSuffix = Math.floor(100000000 + Math.random() * 900000000);
      username = `guest${randomSuffix}@guest.local`;

      // Check if username already exists
      const existingUser = await User.findOne({ username });
      if (!existingUser) {
        break;
      }
    } while (counter < 5);

    const password = 'p' + Math.floor(10000000000 + Math.random() * 90000000000);

    // Hash the password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user object
    const userData = {
      username,
      password: hashedPassword,
      email: username,
      name: `Guest`,
      provider: 'local',
      role: 'USER',
      emailVerified: true, // Auto-verify guest users
    };

    // Create the user
    const newUser = new User(userData);
    const savedUser = await newUser.save();

    // Return user data (excluding sensitive information)
    const responseData = {
      username: savedUser.username,
      password: password,
      message: 'Guest user created successfully',
    };

    res.status(201).json(responseData);
  } catch (error) {
    logger.error('[createGuestUser] Error creating guest user:', error);
    res.status(500).json({
      message: 'Error creating guest user',
      error: error.message,
    });
  }
};

// Apply middleware for rate limiting and ban checking
router.use(registerLimiter);
router.use(checkBan);

// Routes
router.post('/', createGuestUser);

module.exports = router;
