require('dotenv').config({ path: '../.env' }); // Make sure to load the .env file from the root
const connectDb = require('../api/lib/db/connectDb'); // Adjust the path for connectDb
const Payment = require('../api/models/Payment'); // Adjust the path for Payment model

const getAllPaymentsWithUsers = async () => {
  await connectDb();

  Payment.find({}).populate('userId').exec((err, payments) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log(payments); // Each payment will have the user object included
    process.exit(0);
  });
};

getAllPaymentsWithUsers();