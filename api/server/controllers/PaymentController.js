const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const addTokensByUserId = require('../../../config/addTokens');

exports.createPaymentIntent = async (req, res) => {
  try {
    console.log('req.body:', req.body);
    const { priceId, userId, domain, email } = req.body;

    if (
      ![
        'price_1ORgxoHKD0byXXClx3u1yLa0',
        'price_1ORgyJHKD0byXXClfvOyCbp7',
        'price_1ORgyiHKD0byXXClHetdaI3W',
        'price_1ORgzMHKD0byXXClDCm5PkwO',
      ].includes(priceId)
    ) {
      res.status(400).json({ error: 'Invalid price ID' });
      return;
    }

    // // Determine the currency based on the domain
    // let currency;
    // switch(domain) {
    //   case 'gptchina.io':
    //     currency = `CNY`;
    //     break;
    //   case 'gptglobal.io':
    //     currency = `CNY`;
    //     break;
    //   case '8124-204-16-39-70.ngrok-free.app':
    //     currency = `CNY`;
    //     break;
    //   // Add cases for other domains
    //   default:
    //     res.status(400).json({ error: 'Invalid domain' });
    //     return;
    // }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'wechat_pay', 'alipay'],
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
      customer_email: email,
      payment_method_options: {
        wechat_pay: {
          client: 'web',
        },
      },
      mode: 'payment',
      success_url: `${process.env.DOMAIN_CLIENT}`,
      cancel_url: `${process.env.DOMAIN_CLIENT}`,
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
    const priceId = paymentIntent.metadata.priceId; // Retrieve priceId from metadata

    if (!priceId) {
      console.error('Price ID not found in payment intent metadata');
      res.status(400).send({ error: 'Price ID not found' });
      return;
    }

    console.log('Price ID:', priceId);

    // Determine the number of tokens based on the price ID
    let tokens;
    switch (priceId) {
      case 'price_1ORgzMHKD0byXXClDCm5PkwO':
        tokens = 10000000;
        break;
      case 'price_1ORgyiHKD0byXXClHetdaI3W':
        tokens = 1000000;
        break;
      case 'price_1ORgyJHKD0byXXClfvOyCbp7':
        tokens = 500000;
        break;
      case 'price_1ORgxoHKD0byXXClx3u1yLa0':
        tokens = 100000;
        break;
      default:
        console.error('Invalid price ID:', priceId);
        res.status(400).send({ error: 'Invalid price ID' });
        return;
    }

    // Add tokens to user's account
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
