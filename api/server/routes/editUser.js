const express =  require('express')
const router = express.Router()
const controller = require('../controllers/EditUserController')

router.post('/',controller)

module.exports = router