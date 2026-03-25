jest.mock('./connect', () => ({
  connectDb: jest.fn(),
}));

jest.mock('./indexSync', () => jest.fn());

jest.mock('@librechat/data-schemas', () => ({
  createModels: jest.fn((mongooseInstance) => {
    // Simulate what createModels does: register models on mongoose
    if (!mongooseInstance.models.Message) {
      mongooseInstance.models.Message = { name: 'Message' };
    }
    if (!mongooseInstance.models.Conversation) {
      mongooseInstance.models.Conversation = { name: 'Conversation' };
    }
  }),
}));

describe('api/db/index.js', () => {
  test('models are registered before indexSync is loaded', () => {
    const mongoose = require('mongoose');
    delete mongoose.models.Message;
    delete mongoose.models.Conversation;

    // This is the contract: requiring the db index should produce valid models
    require('./index');

    expect(mongoose.models.Message).toBeDefined();
    expect(mongoose.models.Conversation).toBeDefined();
  });
});
