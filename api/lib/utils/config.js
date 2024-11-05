var config = {
  https: process.env.ZARINPAL_PAYMENT_URL,
  sandbox: process.env.ZARINPAL_PAYMENT_URL_SANDBOX,
  merchantIDLength: 36,
  API: {
    PR: "request.json",
    PV: "verify.json",
    UT: "unVerified.json",
  },
  PG: function (sandbox) {
    if (sandbox) {
      return process.env.ZARINPAL_PAYMENT_URL_SANDBOX_PG;
    }
    return process.env.ZARINPAL_PAYMENT_URL_PG;
  },
};

module.exports = config;
