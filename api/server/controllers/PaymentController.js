const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const addTokensByUserId = require('../../../config/addTokens');

exports.createPaymentIntent = async (req, res) => {
  try {
    const { priceId, userId, domain, email, paymentMethod } = req.body;

    const validPriceIds = [
      'price_1ORgxoHKD0byXXClx3u1yLa0', // 10 CNY - only for China users
      'price_1ORgyJHKD0byXXClfvOyCbp7', // 35 CNY - only for China users
      'price_1ORgyiHKD0byXXClHetdaI3W', // 50 CNY - only for China users
      'price_1ORgzMHKD0byXXClDCm5PkwO', // 250 CNY - only for China users
      'price_1P6dqBHKD0byXXClWuA2RGY2', // 2 USD - only for global users
      'price_1P6dqdHKD0byXXClcboa06Tu', // 6 USD - only for global users
      'price_1P6drEHKD0byXXClOjmSkPKm', // 10 USD - only for global users
      'price_1P6drxHKD0byXXClVVLokkLh', // 50 USD - only for global users
    ];

    if (!validPriceIds.includes(priceId)) {
      res.status(400).json({ error: 'Invalid price ID' });
      return;
    }

    const validPaymentMethods = ['card', 'alipay', 'wechat_pay'];

    if (!validPaymentMethods.includes(paymentMethod)) {
      res.status(400).json({ error: 'Invalid payment method' });
      return;
    }

    const paymentMethodOptions = {};

    if (paymentMethod === 'wechat_pay') {
      paymentMethodOptions.wechat_pay = {
        client: 'web',
      };
    }

    const customer = await stripe.customers.create({ email: email });
    const session = await stripe.checkout.sessions.create({
      payment_method_types: [paymentMethod],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      payment_intent_data: {
        metadata: {
          userId: userId.toString(),
          email: email,
          priceId: priceId,
          domain: domain,
        },
      },
      payment_method_options: paymentMethodOptions,
      mode: 'payment',
      success_url: `${process.env.DOMAIN_CLIENT}`,
      cancel_url: `${process.env.DOMAIN_CLIENT}`,
      customer: customer.id, // Pass the customer ID instead of the entire customer object
    });

    res.status(200).json({ sessionId: session.id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

exports.handleWebhook = async (req, res) => {
  const sigHeader = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.rawBody,
      sigHeader,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    console.error(`Webhook Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event['type'] === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object;
    const userId = paymentIntent.metadata.userId;
    const priceId = paymentIntent.metadata.priceId;
    const customerId = paymentIntent.customer;

    // Retrieve the customer's payment history
    const paymentIntents = await stripe.paymentIntents.list({
      customer: customerId,
      limit: 100,
    });

    // Calculate the total spend for the customer
    const totalSpend = paymentIntents.data.reduce((total, intent) => {
      return total + intent.amount;
    }, 0);

    console.log(`Customer ${customerId} has spent a total of ${totalSpend / 100} USD`);

    if (!priceId) {
      console.error('Price ID not found in payment intent metadata');
      res.status(400).send({ error: 'Price ID not found' });
      return;
    }

    console.log('Price ID:', priceId);

    let tokens;
    switch (priceId) {
      case 'price_1ORgzMHKD0byXXClDCm5PkwO': // 250 CNY - only for China users
        tokens = 10000000;
        break;
      case 'price_1ORgyiHKD0byXXClHetdaI3W': // 50 CNY - only for China users
        tokens = 1000000;
        break;
      case 'price_1ORgyJHKD0byXXClfvOyCbp7': // 35 CNY - only for China users
        tokens = 500000;
        break;
      case 'price_1ORgxoHKD0byXXClx3u1yLa0': // 10 CNY - only for China users
        tokens = 100000;
        break;
      case 'price_1P6dqBHKD0byXXClWuA2RGY2': // 2 USD - only for global users
        tokens = 100000;
        break;
      case 'price_1P6dqdHKD0byXXClcboa06Tu': // 6 USD - only for global users
        tokens = 500000;
        break;
      case 'price_1P6drEHKD0byXXClOjmSkPKm': // 10 USD - only for global users
        tokens = 1000000;
        break;
      case 'price_1P6drxHKD0byXXClVVLokkLh': // 50 USD - only for global users
        tokens = 10000000;
        break;
      default:
        console.error('Invalid price ID:', priceId);
        res.status(400).send({ error: 'Invalid price ID' });
        return;
    }

    try {
      const newBalance = await addTokensByUserId(userId, tokens);
      res.status(200).send(`Success! New balance is ${newBalance}`);
    } catch (error) {
      console.error(`Error updating balance: ${error.message}`);
      res.status(500).send({ error: `Error updating balance: ${error.message}` });
    }
  } else {
    console.log('Unhandled event type:', event.type);
    res.status(200).send();
  }
};
