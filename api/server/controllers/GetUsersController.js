const User = require('~/models/User');
const Balance = require('~/models/Balance')

async function getUsersController(req, res) {
  try {
    const users = await User.find().lean()
    const balances = await Balance.find().lean()

    const balanceMap = balances.reduce((acc,curr)=>{
        acc[curr.user] = curr
        return acc
    },{})

    const usersWithBalances = users.map(item=>({
        ...item,
        balance: balanceMap[item._id]?.tokenCredits
        ? balanceMap[item._id]?.tokenCredits
        : 0
    }))

    return res.status(200).json({ message: 'got users successfully.', users: usersWithBalances });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({message: "Internal server error"})
  }
}

module.exports = getUsersController;
