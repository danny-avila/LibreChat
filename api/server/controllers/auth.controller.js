const {
  requestPasswordReset,
  resetPassword,
} = require("../services/auth.service");

// const signUpController = async (req, res, next) => {
//   const signupService = await signup(req.body);
//   return res.json(signupService);
// };

const resetPasswordRequestController = async (req, res, next) => {
  try {
    const resetService = await requestPasswordReset(
      req.body.email
    );
    if (resetService.link) {
      return res.status(200).json(resetService);
    }
    else {
      return res.status(400).json(resetService);
    }
  }
  catch (e) {
    console.log(e);
    return res.status(400).json({ message: e.message });
  }
};

const resetPasswordController = async (req, res, next) => {
  try {
    const resetPasswordService = await resetPassword(
      req.body.userId,
      req.body.token,
      req.body.password
    );
    if(resetPasswordService instanceof Error) {
      return res.status(400).json(resetPasswordService);
    }
    else {
      return res.status(200).json(resetPasswordService);
    }
  }
  catch (e) {
    console.log(e);
    return res.status(400).json({ message: e.message });
  }
};

module.exports = {
  resetPasswordRequestController,
  resetPasswordController,
};