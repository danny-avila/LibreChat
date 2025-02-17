const express = require('express')
const router = express.Router()
const controller = require('../controllers/AddBalanceController')
const {requireJwtAuth} = require('../middleware/')

router.post('/', requireJwtAuth ,controller)


module.exports = router;
