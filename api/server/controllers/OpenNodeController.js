const opennode = require('opennode');
const addTokensByUserId = require('../../../config/addTokens');
opennode.setCredentials(process.env.OPENNODE_API_KEY, 'live');

exports.createBitcoinCharge = async (req, res) => {
  const { userId, email, description, domain, amount, currency } = req.body;
  console.log('Request body for creating OpenNode charge:', req.body);
  const selectedTokens = req.body.selectedTokens;
  const chargeDescription = `${description} || Tokens: ${selectedTokens}`;

  try {
    // Prepare the parameters for the API call
    const chargeParams = {
      amount,
      currency,
      description: chargeDescription,
      customer_name: email,
      order_id: userId,
      callback_url: `https://${domain}/api/payment/opennode/callback`,
      success_url: `https://${domain}`,
      selectedTokens: selectedTokens,
    };

    // Log the parameters for debugging
    console.log('Parameters sent to OpenNode for charge creation:', chargeParams);

    const charge = await opennode.createCharge(chargeParams);

    console.log('OpenNode charge created successfully:', charge);
    res.status(200).json(charge);
  } catch (error) {
    // Enhanced error logging
    console.error('Failed to create OpenNode charge. Error details:', error);
    if (error.response) {
      // Log more error details if available
      console.error('Error response:', {
        data: error.response.data,
        status: error.response.status,
        headers: error.response.headers,
      });
    } else if (error.request) {
      // The request was made but no response was received
      console.error('No response received for the request:', error.request);
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('Error setting up the request:', error.message);
    }

    res.status(500).json({ error: 'Internal Server Error' });
  }
};

exports.handleOpenNodeCallback = async (req, res) => {
  console.log('OpenNode callback:', req.body);

  const { status, order_id, description } = req.body;

  if (status === 'paid') {
    try {
      // Adjusted regex pattern to match "Tokens: " followed by digits
      const tokensPattern = /Tokens:\s*(\d+)/;
      const matches = description.match(tokensPattern);

      if (!matches || matches.length < 2) {
        throw new Error('Failed to extract selectedTokens from description');
      }

      const selectedTokens = parseInt(matches[1], 10);
      if (isNaN(selectedTokens)) {
        throw new Error('Extracted selectedTokens is not a valid number');
      }

      const newBalance = await addTokensByUserId(order_id, selectedTokens);
      console.log(`Success! New balance is ${newBalance}`);
      res.status(200).json({ message: 'OpenNode callback handled successfully, balance updated.' });
    } catch (error) {
      console.error(`Error updating balance: ${error.message}`);
      res.status(500).json({ error: `Error updating balance: ${error.message}` });
    }
  } else {
    console.log('Payment not successful or unhandled status:', status);
    res.status(400).json({ error: 'Payment not successful or unhandled status' });
  }
};
