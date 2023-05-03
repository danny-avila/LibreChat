const express = require('express');
const {
  resetPasswordRequestController, 
  resetPasswordController,
} = require("../controllers/auth.controller");

const router = express.Router();

router.post("/requestPasswordReset", resetPasswordRequestController);
router.post("/resetPassword", resetPasswordController);


module.exports = router;