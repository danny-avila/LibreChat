const { User } = require('~/db/models');
const { logger } = require('@librechat/data-schemas');

const bcrypt = require('bcryptjs');

/**
 * Get paginated list of users
 * @route GET /api/admin/users
 * @param {Object} req - Express request object
 * @param {Object} req.query - Query parameters
 * @param {number} req.query.page - Page number (default: 1)
 * @param {number} req.query.limit - Number of users per page (default: 10)
 * @param {Object} res - Express response object
 * @returns {Object} Paginated users list with metadata
 */
const getUsers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const users = await User.find({}, '-password')
            .skip(skip)
            .limit(limit)
            .lean();

        const total = await User.countDocuments();

        res.status(200).json({
            users,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalUsers: total,
        });
    } catch (error) {
        logger.error('Error getting users:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/**
 * Get a single user by ID
 * @route GET /api/admin/users/:id
 * @param {Object} req - Express request object
 * @param {Object} req.params - URL parameters
 * @param {string} req.params.id - User ID
 * @param {Object} res - Express response object
 * @returns {Object} User object (password excluded)
 */
const getUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id, '-password').lean();
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.status(200).json(user);
    } catch (error) {
        logger.error('Error getting user:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/**
 * Create a new user
 * @route POST /api/admin/users
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body
 * @param {string} req.body.email - User email (required, must be unique)
 * @param {string} req.body.password - User password (required, min 8 chars)
 * @param {string} req.body.username - Username (required, must be unique)
 * @param {string} req.body.name - User display name (optional)
 * @param {string} req.body.role - User role: 'USER' or 'ADMIN' (default: 'USER')
 * @param {Object} res - Express response object
 * @returns {Object} Created user object (password excluded)
 */
const createUser = async (req, res) => {
    try {
        const { email, password, name, username, role } = req.body;

        if (!email || !password || !username) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'User with this email already exists' });
        }

        const existingUsername = await User.findOne({ username });
        if (existingUsername) {
            return res.status(400).json({ message: 'Username already taken' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const newUser = new User({
            email,
            password: hashedPassword,
            name,
            username,
            role: role || 'USER',
            emailVerified: true,
        });

        await newUser.save();

        // Return user without password
        const userObj = newUser.toObject();
        delete userObj.password;

        res.status(201).json(userObj);
    } catch (error) {
        logger.error('Error creating user:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/**
 * Update an existing user
 * @route PUT /api/admin/users/:id
 * @param {Object} req - Express request object
 * @param {Object} req.params - URL parameters
 * @param {string} req.params.id - User ID
 * @param {Object} req.body - Request body
 * @param {string} req.body.email - New email (must be unique if changed)
 * @param {string} req.body.username - New username (must be unique if changed)
 * @param {string} req.body.name - New display name
 * @param {string} req.body.role - New role: 'USER' or 'ADMIN'
 * @param {Object} res - Express response object
 * @returns {Object} Updated user object (password excluded)
 * @note Changing email sets emailVerified to false for security
 */
const updateUser = async (req, res) => {
    try {
        const { role, username, name, email } = req.body;
        const userId = req.params.id;

        // Check if user exists
        const existingUser = await User.findById(userId);
        if (!existingUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        const updateData = {};
        if (role) updateData.role = role;
        if (name) updateData.name = name;

        // Check email uniqueness if email is being updated
        if (email && email !== existingUser.email) {
            const emailTaken = await User.findOne({ email, _id: { $ne: userId } });
            if (emailTaken) {
                return res.status(400).json({ message: 'Email already in use by another user' });
            }
            updateData.email = email;
            // When email is changed, mark as unverified for security
            updateData.emailVerified = false;
        }

        // Check username uniqueness if username is being updated
        if (username && username !== existingUser.username) {
            const usernameTaken = await User.findOne({ username, _id: { $ne: userId } });
            if (usernameTaken) {
                return res.status(400).json({ message: 'Username already taken' });
            }
            updateData.username = username;
        }

        const user = await User.findByIdAndUpdate(userId, updateData, { new: true, select: '-password' }).lean();
        res.status(200).json(user);
    } catch (error) {
        logger.error('Error updating user:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/**
 * Delete a user
 * @route DELETE /api/admin/users/:id
 * @param {Object} req - Express request object
 * @param {Object} req.params - URL parameters
 * @param {string} req.params.id - User ID
 * @param {Object} res - Express response object
 * @returns {Object} Success message
 */
const deleteUser = async (req, res) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.status(200).json({ message: 'User deleted successfully' });
    } catch (error) {
        logger.error('Error deleting user:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

module.exports = {
    getUsers,
    getUser,
    createUser,
    updateUser,
    deleteUser,
};
