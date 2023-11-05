const express = require('express');
const router = express.Router();
const paypal = require('../../../config/paypal');
const Payment = require('../../models/schema/paymentSchema.js');
// const cors = require('cors');
// const helmet = require('helmet');

// // Apply CORS to this router only
// router.use(cors({
//   origin: 'http://localhost:3090',
//   credentials: true,
// }));

// // CSP Middleware for PayPal routes
// const paypalCsp = helmet.contentSecurityPolicy({
//   directives: {
//     ...helmet.contentSecurityPolicy.getDefaultDirectives(),
//     'script-src': [
//       "'self'",
//       "https://*.paypal.com",
//       "'unsafe-inline'", // Add this line to allow inline scripts if needed
//       "'unsafe-eval'" // Be cautious with 'unsafe-eval' which can be a security risk
//     ],
//     // Add other directives as needed
//   },
// });

// // Apply the CSP middleware only to the PayPal-related routes
// router.use('/create-payment', paypalCsp);
// router.use('/success', paypalCsp);
// router.use('/cancel', paypalCsp);

router.post('/create-payment', async (req, res) => {
  console.log('Attempting to create a payment...'); // Debug log
  try {
    const payment = {
      intent: 'sale',
      payer: {
        payment_method: 'paypal'
      },
      redirect_urls: {
        // Make sure to change these URLs to your actual success and cancel endpoints
        return_url: 'http://localhost:3090/subscription/paypal-return',
        cancel_url: 'http://localhost:3090/subscription/payment-cancelled' // need to be updated about payment-cancelled
      },
      transactions: [{
        description: 'LibreChat Subscription',
        amount: {
          currency: 'USD',
          total: '10.00' // This should match the amount in the success endpoint.
        }
      }]
    };

    paypal.payment.create(payment, (error, payment) => {
      if (error) {
        console.warn('Payment creation encountered an error:', error); // Debug log
        res.status(500).json({ error: error.toString() });
      } else {
        let approvalUrl = payment.links.find(link => link.rel === 'approval_url');
        if (approvalUrl) {
          console.log('Payment created successfully, approval URL:', approvalUrl.href); // Debug log
          res.json({ approval_url: approvalUrl.href });
        } else {
          console.warn('No approval URL found after payment creation'); // Debug log
          res.status(500).json({ error: 'No approval URL found' });
        }
      }
    });

  } catch (error) {
    console.error('An exception occurred in create-payment:', error); // Debug log
    res.status(500).json({ error: 'An error occurred while creating payment.' });
  }
});

router.get('/success', async (req, res) => {
  console.log('Payment success route called with query:', req.query); // Debug log
  const { PayerID, paymentId } = req.query;
  const userID = req.user.id;

  const execute_payment = {
    payer_id: PayerID,
    transactions: [{
      amount: {
        currency: 'USD',
        total: '10.00' // This should match the amount in the payment creation.
      }
    }]
  };

  try {
    let executedPayment = await paypal.payment.execute(paymentId, execute_payment);
    console.log('Payment executed successfully:', executedPayment); // Debug log

    // Create payment record in MongoDB
    const paymentRecord = new Payment({
      // Make sure to handle the user ID appropriately depending on your authentication mechanism
      userId: userID, // This is system's user ID
      payerId: PayerID, // This is PayPal's payer ID
      amount: executedPayment.transactions[0].amount.total,
      currency: executedPayment.transactions[0].amount.currency,
      paymentId: paymentId,
      paymentStatus: executedPayment.state // or any other field that indicates the payment status
    });

    await paymentRecord.save();
    console.log('Payment record saved to MongoDB:', paymentRecord); // Debug log

    // Adjust to a success handler or a success page
    res.redirect(`http://localhost:3090/subscription/payment-success?paymentId=${paymentId}`);
  } catch (error) {
    console.error('Payment execution failed:', error);
    // If something goes wrong, redirect or inform the frontend accordingly
    res.redirect(`http://localhost:3090/subscription/payment-failed?paymentId=${paymentId}&error=${error.message}`);
  }
});

router.get('/cancel', (req, res) => {
  console.log('Payment canceled by user.'); // Debug log
  // This should redirect to your cancel page or handle the cancellation process
  res.redirect('http://localhost:3090/subscription/payment-cancelled');
});

module.exports = router;
