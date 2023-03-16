const express = require('express');
const router = express.Router();

// WARNING!
// THIS IS NOT A READY TO USE USER SYSTEM
// PLEASE IMPLEMENT YOUR OWN USER SYSTEM

const userSystemEnabled = process.env.ENABLE_USER_SYSTEM || false

// Logout
router.get('/logout', (req, res) => {
  // Do anything you want
  console.warn('logout not implemented!')

  // finish
  res.redirect('/')
});
  
// Login
router.get('/', async (req, res) => {
  // Do anything you want
  console.warn('login not implemented! Automatic passed as sample user')

  // save the user info into session
  // username will be used in db
  // display will be used in UI
  req.session.user = {
    username: 'sample_user',
    display: 'Sample User',
  }

  req.session.save(function (error) {
    if (error) {    
        console.log(error);
        res.send(`<h1>Login Failed. An error occurred. Please see the server logs for details.</h1>`);
    } else res.redirect('/')
  })
});

module.exports = router;
