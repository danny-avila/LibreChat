const MondayTool = require('./MondayTool');

const tool = new MondayTool({ apiKey: 'test' });

console.log('Testing createColumn parameters...');

const input = {
  action: 'createColumn',
  boardId: '123',
  columnTitle: 'Test',
  columnType: 'text'
};

console.log('Input:', JSON.stringify(input, null, 2));

try {
  tool._call(input).then(result => {
    console.log('Success:', result);
  }).catch(error => {
    console.log('Error:', error.message);
  });
} catch (error) {
  console.log('Sync Error:', error.message);
} 