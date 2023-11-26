const jwt = require('jsonwebtoken');
const Payment = require('../models/payments');

const checkSubscription = async (req, res, next) => {
  try {
    const token = req.headers.authorization.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;

    const latestPayment = await Payment.findOne({ userId: userId }).sort({ expirationDate: -1 });

    if (!latestPayment || new Date() > latestPayment.expirationDate) {
      return  res.end(); // res.status(200).send('Access restricted');
    }

    req.user = { id: userId, ...latestPayment.toObject() }; // Attach user and payment info to request
    next();
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = checkSubscription;
