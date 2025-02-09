
const express = require('express')
const router = express.Router()
const controller = require('../controllers/getUsers')

router.get('/', controller)

module.exports = router;