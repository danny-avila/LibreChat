const MondayTool = require('./api/app/clients/tools/structured/MondayTool');

async function testWebhookFunctions() {
  // Create tool instance with override to skip API key validation
  const tool = new MondayTool({ override: true });
  
  // Mock the GraphQL request to see what query is being sent
  tool.makeGraphQLRequest = async (query, variables) => {
    console.log('=== GraphQL Query ===');
    console.log(query);
    console.log('=== Variables ===');
    console.log(JSON.stringify(variables, null, 2));
    
    // Return mock error to simulate API response
    throw new Error('Simulated API call to see query structure');
  };

  console.log('Testing createWebhook...');
  try {
    await tool._call({
      action: 'createWebhook',
      boardId: '123456789',
      url: 'https://example.com/webhook',
      event: 'create_item'
    });
  } catch (error) {
    console.log('Error:', error.message);
  }

  console.log('\n\nTesting getWebhooks...');
  try {
    await tool._call({
      action: 'getWebhooks',
      boardId: '123456789'
    });
  } catch (error) {
    console.log('Error:', error.message);
  }

  console.log('\n\nTesting deleteWebhook...');
  try {
    await tool._call({
      action: 'deleteWebhook',
      webhookId: '987654321'
    });
  } catch (error) {
    console.log('Error:', error.message);
  }
}

testWebhookFunctions().catch(console.error);
