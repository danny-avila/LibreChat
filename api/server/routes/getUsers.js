
const express = require('express')
const router = express.Router()
const controller = require('../controllers/GetUsersController')

router.get('/', controller)

module.exports = router;