import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createModels } from '~/models';
import type { IPaymentOrder } from '~/types';

let mongoServer: InstanceType<typeof MongoMemoryServer>;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const models = createModels(mongoose);
  void models;
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

describe('PaymentOrder model', () => {
  it('stores recharge order fields and defaults status to pending', async () => {
    const models = createModels(mongoose) as { PaymentOrder?: mongoose.Model<IPaymentOrder> };
    const PaymentOrder = models.PaymentOrder;

    expect(PaymentOrder).toBeDefined();

    const order = await PaymentOrder!.create({
      user: new mongoose.Types.ObjectId(),
      outTradeNo: 'LC202605260001',
      amountCny: 50,
      credits: 5500000,
      packageId: 'cny_50',
      customAmountCny: 50,
      providerTradeNo: '202605260001',
      providerPayload: {
        tradeStatus: 'TRADE_SUCCESS',
        notifyId: 'notify-1',
        gatewayHost: 'openapi.alipay.com',
      },
    });

    expect(PaymentOrder!.modelName).toBe('PaymentOrder');
    expect(order.provider).toBe('alipay');
    expect(order.status).toBe('pending');
    expect(order.outTradeNo).toBe('LC202605260001');
    expect(order.packageId).toBe('cny_50');
    expect(order.customAmountCny).toBe(50);
    expect(order.providerTradeNo).toBe('202605260001');
    expect(order.providerPayload?.tradeStatus).toBe('TRADE_SUCCESS');
  });
});
