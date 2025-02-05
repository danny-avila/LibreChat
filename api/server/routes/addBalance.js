const express = require('express')
const router = express.Router()
const controller = require('../controllers/AddBalance')
const {requireJwtAuth} = require('../middleware/')

//find how requireJwtAuth work
router.post('/add_balance', requireJwtAuth ,controller)


module.exports = router;
