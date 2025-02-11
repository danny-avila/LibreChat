const User = require('~/models/User');

const Balance = require('~/models/Balance')

async function getUsersController(req, res) {
  try {
    const users = await User.find().lean()
    console.log('users:' ,users)

    const balances = await Balance.find().lean()

    const balanceMap = balances.reduce((acc,curr)=>{
        acc[curr.user] = curr
        return acc
    },{})

    console.log('balanceMap:' , balanceMap)


    const usersWithBalances = users.map(item=>({
        ...item,
        balance: balanceMap[item._id]?.tokenCredits
        ? balanceMap[item._id]?.tokenCredits
        : 0
    }))

    console.log('usersWithBalances:' , usersWithBalances)

    return res.status(200).json(usersWithBalances);
  } catch (error) {
    console.error('Error', error);
    return res.status(500).json({message: "Internal server error"})
  }
}

module.exports = getUsersController;
