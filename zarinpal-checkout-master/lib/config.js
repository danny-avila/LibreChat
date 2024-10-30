var config = {
  https: "https://payment.zarinpal.com/pg/v4/payment/",
  sandbox: "https://sandbox.zarinpal.com/pg/v4/payment/",
  merchantIDLength: 36,
  API: {
    PR: "request.json",
    PV: "verify.json",
    UT: "unVerified.json",
  },
  PG: function (sandbox) {
    if (sandbox) {
      return "https://sandbox.zarinpal.com/pg/StartPay/";
    }
    return "https://www.zarinpal.com/pg/StartPay/";
  },
};

module.exports = config;
