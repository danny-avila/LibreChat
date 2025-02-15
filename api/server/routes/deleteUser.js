const express =require('express')
const router = express.Router()
const controller = require('../controllers/DeleteUserController')

router.delete('/:id' , controller)

module.exports = router