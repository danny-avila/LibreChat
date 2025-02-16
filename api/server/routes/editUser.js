const express =  require('express')
const router = express.Router()
const controller = require('../controllers/EditUserController')

router.put('/:id',controller)

module.exports = router