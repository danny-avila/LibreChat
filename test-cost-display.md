# Testing Conversation Cost Display

## Where to Find the Cost Display

The conversation cost display appears as a **💰 icon with the cost amount** in the chat header.

### Location:
- **Desktop**: Right side of the header, between the model selector area and the Export/Share button
- **Mobile**: In the scrollable header area with other controls

### What it looks like:
- 💰 $0.00 (green - under $0.01)
- 💰 $0.05 (yellow - $0.01 to $0.10)
- 💰 $0.50 (orange - $0.10 to $1.00)
- 💰 $5.00 (red - over $1.00)

## Requirements for Cost Display

1. **Active Conversation**: Must be in an existing conversation, not a new chat
2. **Messages with Transactions**: The conversation must have messages that created transaction records
3. **Backend Running**: The API server must be running on port 3080
4. **Frontend Running**: The web app must be running on port 3091

## How to Test

1. Start the backend:
   ```bash
   npm run backend:dev
   ```

2. Start the frontend:
   ```bash
   npm run frontend:dev
   ```

3. Open http://localhost:3091

4. Start a conversation with any model (GPT-4, Claude, etc.)

5. Send a few messages

6. Look for the 💰 icon in the header - it should show the accumulated cost

7. Hover over the icon to see:
   - Total cost
   - Primary model used
   - Total tokens consumed
   - Last updated time

## Troubleshooting

If you don't see the cost display:

1. **Check Console**: Open browser DevTools and look for any errors
2. **Verify API**: The cost endpoint should be accessible at `/api/convos/{id}/cost`
3. **Check Transactions**: Ensure the conversation has transaction records in MongoDB
4. **Model Pricing**: Verify the model you're using has pricing data configured

## Debug Commands

Check if a conversation has transactions:
```javascript
// In MongoDB shell
db.transactions.find({ conversationId: "YOUR_CONVERSATION_ID" }).count()
```

Test the API endpoint directly:
```bash
# You'll need to be authenticated - use your browser's cookies
curl -H "Cookie: YOUR_AUTH_COOKIE" \
  http://localhost:3080/api/convos/YOUR_CONVERSATION_ID/cost
```