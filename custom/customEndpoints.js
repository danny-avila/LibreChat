// Custom file
const User = require('../api/models/User');
const { registerSchema } = require('~/strategies/validators');
const bcrypt = require('bcryptjs');

function verifyToken(req, res, next) {
  const token = req.headers.authorization;
  const hardcodedToken = `Bearer ${process.env.CUSTOM_ENDPOINT_TOKEN}`;
  if (token == hardcodedToken) {
    next();
  } else {
    res.status(403).json({ message: 'Forbidden' });
  }
}

const remoteAddAssistant = async (req, res) => {
  const email = req.body.customer.email;
  let user = await User.findOne({ email });

  if (!user) {
    // create new user
    const name = req.body.customer.first_name + ' ' + req.body.customer.last_name;
    user = await createUser(email, 'Abcd1234?', name, email); // TODO change hardcoded password
  }

  if (user) {
    // add assistant ids
    const assistantIds = user.assistantIds || [];
    for (const assistantId of req.body.assistantIds) {
      if (!assistantIds.includes(assistantId)) {
        assistantIds.push(assistantId);
      }
    }
    await User.updateOne({ _id: user.id }, { assistantIds });
  } else {
    return res.status(400).json({ message: 'Unable to create user' });
  }

  return res.status(200).json({ user });
};

const remoteRemoveAssistant = async (req, res) => {
  const email = req.body.customer.email;
  let user = await User.findOne({ email });

  if (user) {
    // remove assistant ids
    const assistantIds = user.assistantIds;
    for (const assistantId of req.body.assistantIds) {
      const index = assistantIds.indexOf(assistantId);
      if (index !== -1) {
        assistantIds.splice(index, 1);
      }
    }
    await User.updateOne({ _id: user.id }, { assistantIds });
  } else {
    return res.status(400).json({ message: 'User not found' });
  }

  return res.status(200).json({ message: 'removed' });
};

const createUser = async (email, password, name, username) => {
  const userExists = await User.findOne({ $or: [{ email }, { username }] });
  if (userExists) {
    return false;
  }

  const user = {
    email,
    password,
    name,
    username,
    confirm_password: password,
    role: 'USER',
  };

  let result;
  try {
    result = await registerUserSilent(user);
    console.log(result);
  } catch (error) {
    console.log('Error: ' + error.message);
    return false;
  }

  if (!result) {
    return false;
  }

  const userCreated = await User.findOne({ $or: [{ email }, { username }] });
  if (userCreated) {
    return userCreated;
  }

  return false;
};

const registerUserSilent = async (user) => {
  const { error } = registerSchema.safeParse(user);
  if (error) {
    return false;
  }

  const { email, password, name, username } = user;

  try {
    const existingUser = await User.findOne({ email }).lean();

    if (existingUser) {
      return false;
    }

    const salt = bcrypt.genSaltSync(10);

    const newUser = await new User({
      provider: 'local',
      email,
      password: bcrypt.hashSync(password, salt),
      username,
      name,
      avatar: null,
      role: 'USER',
    });

    await newUser.save();

    return newUser;
  } catch (err) {
    return false;
  }
};

module.exports = {
  verifyToken,
  remoteAddAssistant,
  remoteRemoveAssistant,
};
