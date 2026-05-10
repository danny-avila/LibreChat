describe('api/db/index.js', () => {
  test('createModels is called before indexSync is loaded', () => {
    jest.resetModules();

    const callOrder = [];

    jest.mock('@librechat/data-schemas', () => ({
      createModels: jest.fn((m) => {
        callOrder.push('createModels');
        m.models.Message = { name: 'Message' };
        m.models.Conversation = { name: 'Conversation' };
      }),
    }));

    jest.mock('./indexSync', () => {
      callOrder.push('indexSync');
      return jest.fn();
    });

    jest.mock('./connect', () => ({ connectDb: jest.fn() }));

    require('./index');

    expect(callOrder).toEqual(['createModels', 'indexSync']);
  });
});
