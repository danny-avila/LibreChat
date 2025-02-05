
// async function balanceController(req, res) {
//   const { tokenCredits: balance = '' } =
//     (await Balance.findOne({ user: req.user.id }, 'tokenCredits').lean()) ?? {};
//   res.status(200).send('' + balance);
// }

// module.exports = balanceController;


// const AddBalance = require('~/models/AddBalance')


//use balance model but i must modified it for add balance
const Balance = require('~/models/Balance')

async function addBalanceController(req,res){
    console.log(req,"test")
   res.status(200).send('Hello World')

}


module.exports = addBalanceController