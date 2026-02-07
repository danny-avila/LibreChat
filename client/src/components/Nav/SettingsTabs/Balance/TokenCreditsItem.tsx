const express = require('express');
const axios = require('axios');
const { MongoClient, ObjectId } = require('mongodb');
const app = express();

app.use(express.json());

app.get('/', (req, res) => res.status(200).send("SERVER IS ALIVE"));

const PRICING = { 1: 25000, 2: 45000, 3: 60000, 4: 72000, 5: 85000 };

app.get('/pay', async (req, res) => {
  try {
    const { email, quantity } = req.query; 
    const qty = parseInt(quantity) || 1;
    const totalPrice = PRICING[qty] || 25000;
    const unitPrice = Math.floor(totalPrice / qty); 
    const totalTokens = qty * 5000000;

    const options = {
      method: 'POST',
      url: 'https://api.paymongo.com/v1/checkout_sessions',
      headers: {
        accept: 'application/json',
        'Content-Type': 'application/json',
        authorization: `Basic ${Buffer.from(process.env.PAYMONGO_SECRET_KEY + ':').toString('base64')}`
      },
      data: {
        data: {
          attributes: {
            send_email_receipt: true, 
            billing: { email: email },
            line_items: [{ 
              amount: unitPrice, currency: 'PHP', 
              name: `Ryan's Lab: ${totalTokens / 1000000}M Tokens`, 
              quantity: qty,
              images: ["https://ryanslab.space/logo.png"] 
            }],
            payment_method_types: ['qrph', 'gcash', 'maya'],
            success_url: process.env.SUCCESS_URL,
            metadata: { email: email, token_credits: totalTokens.toString() } 
          }
        }
      }
    };
    const response = await axios.request(options);
    res.redirect(response.data.data.attributes.checkout_url);
  } catch (error) {
    res.status(500).send("Error");
  }
});

app.post('/webhook', async (req, res) => {
  console.log("⚡ [WEBHOOK] Signal received");
  res.status(200).send('OK');

  let client;
  try {
    const { data } = req.body;
    const resource = data?.attributes?.data || data; 
    const metadata = resource?.attributes?.metadata || resource?.metadata;
    if (!metadata || !metadata.email) return;

    const userEmail = metadata.email.trim();
    const tokensToAdd = Number(metadata.token_credits);

    client = new MongoClient(process.env.MONGO_URI);
    await client.connect();
    const db = client.db("test");

    // 1. Get the User ID from 'users'
    const userDoc = await db.collection('users').findOne({ 
      email: { $regex: new RegExp(`^${userEmail}$`, 'i') } 
    });

    if (!userDoc) {
      console.log(`❌ User ${userEmail} not found.`);
      return;
    }

    const userIdString = userDoc._id.toString();
    const userIdObject = new ObjectId(userIdString);

    console.log(`🔍 Found User ID: ${userIdString}. Updating balances...`);

    // 2. THE BRUTE FORCE UPDATE
    // We target the 'user' field in 'balances' using both String and ObjectId.
    // We also update both 'tokenCredits' (CamelCase) and 'tokencredits' (Lowercase).
    const updateResult = await db.collection('balances').updateOne(
      { 
        $or: [
          { user: userIdString }, 
          { user: userIdObject }
        ] 
      },
      { 
        $inc: { 
          "tokenCredits": tokensToAdd,
          "tokencredits": tokensToAdd 
        },
        $set: { 
          "last_topup": new Date(),
          "updatedAt": new Date() 
        }
      }
    );

    if (updateResult.modifiedCount > 0) {
      console.log(`🎉 SUCCESS: Tokens added to user ${userIdString}`);
    } else {
      console.log(`⚠️ Match failed for user field. Attempting one-time creation...`);
      // If we couldn't find the record, it might be missing or under a different ID.
      // We'll create it exactly how the UI expects it.
      await db.collection('balances').updateOne(
        { user: userIdObject }, 
        { 
          $inc: { "tokenCredits": tokensToAdd },
          $set: { "updatedAt": new Date() }
        },
        { upsert: true }
      );
    }

  } catch (err) {
    console.error("🔥 WEBHOOK ERROR:", err.message);
  } finally {
    if (client) await client.close();
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 ONLINE`));
