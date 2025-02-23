const { SystemRoles } = require('librechat-data-provider');
const { logger } = require('~/config');

/**
 * Checks if the user can delete their account
 *
 * @async
 * @function
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 *
 * @returns {Promise<function|Object>} - Returns a Promise which when resolved calls next middleware if the user can delete their account
 */


 const requireAdminRole  =async (req,res, next=()=>{}) => {
    const {user} = req
    if(user?.role === SystemRoles.ADMIN){
        return next()
    }else{
        logger.error(`[User] [Admin Action] [User is not admin] [User: ${user?.id}]`);
    return res.status(403).send({ message: 'You do not have permission to perform this action' });
    }    
 }
module.exports = requireAdminRole;
