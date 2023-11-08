const express = require('express');
const cors = require('cors');
const router = express.Router();
const paypal = require('../../../config/paypal.js');
const Payment = require('../../models/schema/paymentSchema.js');
const requireJwtAuth = require('../../middleware/requireJwtAuth');
const util = require('util'); // Added to use promisify

// Convert callback-based functions to promises
const createPayment = util.promisify(paypal.payment.create).bind(paypal.payment);
const executePayment = util.promisify(paypal.payment.execute).bind(paypal.payment);

// Define CORS options for this router
const corsOptions = {
  origin: 'http://localhost:3090',
  credentials: true,
};
router.use(cors(corsOptions));
router.options('*', cors(corsOptions));

router.post('/create-payment', requireJwtAuth, async (req, res) => {
  console.log('Attempting to create a payment...');
  try {
    const paymentDetails = {
      intent: 'sale',
      payer: {
        payment_method: 'paypal'
      },
      redirect_urls: {
        return_url: 'http://localhost:3090/subscription/paypal-return',
        cancel_url: 'http://localhost:3090/subscription/payment-cancelled'
      },
      transactions: [{
        description: 'LibreChat Subscription',
        amount: {
          currency: 'USD',
          total: '10.00'
        }
      }]
    };

    const paymentResult = await createPayment(paymentDetails);
    let approvalUrl = paymentResult.links.find(link => link.rel === 'approval_url');
    if (approvalUrl) {
      console.log('Payment created successfully, approval URL:', approvalUrl.href);
      res.json({ approval_url: approvalUrl.href });
    } else {
      console.warn('No approval URL found after payment creation');
      res.status(500).json({ error: 'No approval URL found' });
    }
  } catch (error) {
    console.error('An exception occurred in create-payment:', error);
    res.status(500).json({ error: error.toString() });
  }
});

router.get('/success', requireJwtAuth, async (req, res) => {
  console.log('Logged in user:', req.user);
  console.log('Payment success route called with query:', req.query);
  const { PayerID, paymentId } = req.query;

  const execute_payment_json = {
    payer_id: PayerID,
    transactions: [{
      amount: {
        currency: 'USD',
        total: '10.00'
      }
    }]
  };

  try {
    const userID = req.user.id;
    const executedPayment = await executePayment(paymentId, execute_payment_json);
    console.log('Payment executed successfully:', JSON.stringify(executedPayment, null, 2));

    const transaction = executedPayment.transactions[0];
    const sale = transaction.related_resources[0].sale;

    const paymentRecord = new Payment({
      userId: userID,
      payerId: PayerID,
      amount: sale.amount.total,
      currency: sale.amount.currency,
      paymentId: paymentId,
      paymentStatus: executedPayment.state
    });

    await paymentRecord.save();
    console.log('Payment record saved to MongoDB:', paymentRecord);

    res.redirect(`http://localhost:3090/subscription/payment-success?paymentId=${paymentId}`);
  } catch (error) {
    console.error('Payment execution failed:', error, 'Response:', error.response);
    res.redirect(`http://localhost:3090/subscription/payment-failed?paymentId=${paymentId}&error=${error.message}`);
  }
});

router.get('/cancel', (req, res) => {
  console.log('Payment canceled by user.');
  res.redirect('http://localhost:3090/subscription/payment-cancelled');
});

module.exports = router;
