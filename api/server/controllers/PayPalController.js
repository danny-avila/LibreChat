const paypal = require('@paypal/checkout-server-sdk');
const addTokensByUserId = require('../../../config/addTokens');

// Setting up PayPal environment
function environment() {
  let clientId = process.env.PAYPAL_CLIENT_ID;
  let clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  return process.env.NODE_ENV === 'production'
    ? new paypal.core.LiveEnvironment(clientId, clientSecret)
    : new paypal.core.SandboxEnvironment(clientId, clientSecret);
}

function client() {
  return new paypal.core.PayPalHttpClient(environment());
}

// function to convert RMB to USD using the current exchange rate
function convertRmbToUsd(amountCNY) {
  const exchangeRate = 7.22; // exchange rate: 1 USD = 7.22 RMB
  return amountCNY / exchangeRate;
}

exports.createPayment = async (req, res) => {
  const { userId, amountCNY, selectedTokens } = req.body;
  console.log(
    'Creating PayPal payment for user',
    userId,
    'with amount',
    amountCNY,
    'CNY and selected tokens',
    selectedTokens,
  );

  // Convert amount from RMB to USD based on the current exchange rate
  const amountInUsd = convertRmbToUsd(amountCNY);

  // Concatenate userId and selectedTokens to use as custom_id
  const customId = `${userId}:${selectedTokens}`;

  const request = new paypal.orders.OrdersCreateRequest();
  request.prefer('return=representation');
  request.requestBody({
    intent: 'CAPTURE',
    purchase_units: [
      {
        amount: {
          currency_code: 'USD',
          value: amountInUsd.toFixed(2).toString(),
        },
        custom_id: customId, // Use concatenated customId
      },
    ],
    application_context: {
      return_url: process.env.PAYPAL_RETURN_URL,
      cancel_url: process.env.PAYPAL_CANCEL_URL,
    },
  });

  try {
    const response = await client().execute(request);
    if (response.statusCode === 201) {
      const approvalUrl = response.result.links.find((link) => link.rel === 'approve').href;
      console.log('Order created successfully: ', response.result.id);
      res.json({ id: response.result.id, approvalUrl: approvalUrl });
    }
  } catch (error) {
    console.error('Error creating PayPal payment:', error);
    res.status(500).send('Error creating PayPal payment');
  }
};

exports.executePayment = async (req, res) => {
  const { orderId } = req.body; // PayPal order ID returned on payment creation

  const request = new paypal.orders.OrdersCaptureRequest(orderId);
  request.requestBody({});
  console.log('Sending PayPal order create request with:', request);

  try {
    const capture = await client().execute(request);
    res.status(200).json(capture.result);
  } catch (error) {
    console.error(error);
    res.status(500).send('Error executing PayPal payment');
  }
};

exports.handleWebhook = async (req, res) => {
  console.log('Received webhook with body:', JSON.stringify(req.body));

  const event = req.body;

  if (event.event_type === 'CHECKOUT.ORDER.APPROVED') {
    const purchaseUnit = event.resource.purchase_units[0];
    const customId = purchaseUnit.custom_id;
    // Split the custom_id to extract userId and selectedTokens
    const [userId, selectedTokens] = customId.split(':');

    console.log(`Approved payment for user ${userId} with selected tokens ${selectedTokens}.`);

    try {
      // Assuming selectedTokens is the number of tokens to add
      const newBalance = await addTokensByUserId(userId, parseInt(selectedTokens, 10));
      console.log(`Success! ${selectedTokens} tokens added, new balance is ${newBalance}.`);
      res.status(200).send('Success! Tokens added.');
    } catch (error) {
      console.error(`Error updating token balance for user ${userId}:`, error);
      res.status(500).send({ error: `Error updating token balance: ${error.message}` });
    }
  } else {
    console.log('Unhandled event type:', event.event_type);
    res.status(200).send('Event received, but not handled.');
  }
};
