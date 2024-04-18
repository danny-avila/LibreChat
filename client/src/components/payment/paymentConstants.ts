export const tokenOptions = [
  {
    tokens: 100000,
    label: 'com_token_package_label_100k',
    price: 'com_token_package_price_100k_global',
    amount: 1.5,
    currency: 'USD',
    priceId: 'price_1P6dqBHKD0byXXClWuA2RGY2', // 1.50 USD - only for global users
  },
  {
    tokens: 500000,
    label: 'com_token_package_label_500k',
    price: 'com_token_package_price_500k_global',
    amount: 5.0,
    currency: 'USD',
    priceId: 'price_1P6dqdHKD0byXXClcboa06Tu', // 5.00 USD - only for global users
  },
  {
    tokens: 1000000,
    label: 'com_token_package_label_1m',
    price: 'com_token_package_price_1m_global',
    amount: 7.5,
    priceId: 'price_1P6drEHKD0byXXClOjmSkPKm', // 7.50 USD - only for global users
  },
  {
    tokens: 10000000,
    label: 'com_token_package_label_10m',
    price: 'com_token_package_price_10m_global',
    amount: 40.0,
    currency: 'USD',
    priceId: 'price_1P6drxHKD0byXXClVVLokkLh', // 40.00 USD - only for global users
  },
];

export const tokenOptionsChina = [
  {
    tokens: 100000,
    label: 'com_token_package_label_100k',
    price: 'com_token_package_price_100k',
    amount: 10,
    currency: 'CNY',
    priceId: 'price_1ORgxoHKD0byXXClx3u1yLa0', // 10 CNY - only for China users
  },
  {
    tokens: 500000,
    label: 'com_token_package_label_500k',
    price: 'com_token_package_price_500k',
    amount: 35,
    currency: 'CNY',
    priceId: 'price_1ORgyJHKD0byXXClfvOyCbp7', // 35 CNY - only for China users
  },
  {
    tokens: 1000000,
    label: 'com_token_package_label_1m',
    price: 'com_token_package_price_1m',
    amount: 50,
    currency: 'CNY',
    priceId: 'price_1ORgyiHKD0byXXClHetdaI3W', // 50 CNY - only for China users
  },
  {
    tokens: 10000000,
    label: 'com_token_package_label_10m',
    price: 'com_token_package_price_10m',
    amount: 250,
    currency: 'CNY',
    priceId: 'price_1ORgzMHKD0byXXClDCm5PkwO', // 250 CNY - only for China users
  },
];

export const chinaPriceIds = [
  'price_1ORgxoHKD0byXXClx3u1yLa0', // 10 CNY - only for China users
  'price_1ORgyJHKD0byXXClfvOyCbp7', // 35 CNY - only for China users
  'price_1ORgyiHKD0byXXClHetdaI3W', // 50 CNY - only for China users
  'price_1ORgzMHKD0byXXClDCm5PkwO', // 250 CNY - only for China users
];

export const globalPriceIds = [
  'price_1P6dqBHKD0byXXClWuA2RGY2', // 1.50 USD - only for global users
  'price_1P6dqdHKD0byXXClcboa06Tu', // 5 USD - only for global users
  'price_1P6drEHKD0byXXClOjmSkPKm', // 7.50 USD - only for global users
  'price_1P6drxHKD0byXXClVVLokkLh', // 40 USD - only for global users
];

export const PAYMENT_OPTION_WECHAT_PAY = 'wechat_pay';
export const PAYMENT_OPTION_ALIPAY = 'alipay';
export const PAYMENT_OPTION_CARD = 'card';
export const PAYMENT_OPTION_BITCOIN = 'bitcoin';
