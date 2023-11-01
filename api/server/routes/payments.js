const express = require('express');
const router = express.Router();
const paypal = require('../../../config/paypal'); // adjust the path according to your structure

router.post('/create-payment', async (req, res) => {
  try {
    const payment = {
      intent: 'sale',
      payer: {
        payment_method: 'paypal'
      },
      redirect_urls: {
        return_url: 'http://localhost:3090/success',
        cancel_url: 'http://localhost:3090/cancel'
      },
      transactions: [{
        description: 'LibreChat Subscription',
        amount: {
          currency: 'USD',
          total: '10.00' // You can change this to the desired amount.
        }
      }]
    };

    paypal.payment.create(payment, (error, payment) => {
      if (error) {
        console.warn(error);
        res.status(500).json({ error: error.toString() });
      } else {
        for(let i = 0; i < payment.links.length; i++) {
          if(payment.links[i].rel === 'approval_url') {
            res.json({ approval_url: payment.links[i].href });
          }
        }
      }
    });

  } catch (error) {
    res.status(500).send({ error: 'An error occurred while creating payment.' });
  }
});

router.get('/success', (req, res) => {
  const payerId = req.query.PayerID;
  const paymentId = req.query.paymentId;

  const execute_payment = {
    payer_id: payerId,
    transactions: [{
      amount: {
        currency: 'USD',
        total: '10.00' // must match the amount set previously
      }
    }]
  };

  paypal.payment.execute(paymentId, execute_payment, (error, payment) => {
    if (error) {
      console.error(error);
      res.sendStatus(500);
    } else {
      res.json({ status: 'success', payment });
    }
  });
});

router.get('/cancel', (req, res) => {
  res.json({ status: 'payment canceled' });
});

router.get('/success', (req, res) => {
  const payerId = req.query.PayerID;
  const paymentId = req.query.paymentId;

  const execute_payment = {
    payer_id: payerId,
    transactions: [{
      amount: {
        currency: 'USD',
        total: '10.00' // must match the amount set previously
      }
    }]
  };

  paypal.payment.execute(paymentId, execute_payment, (error) => {
    if (error) {
      console.error(error);
      // Possibly redirect to an error page on the frontend
      res.redirect('http://localhost:3090/error');
    } else {
      // Redirect to a success page on the frontend
      res.redirect('http://localhost:3090/success');
    }
  });
});

module.exports = router;