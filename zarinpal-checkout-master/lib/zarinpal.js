/**
 * zarinpal-checkout • Simple implementation of ZarinPal Node.js. so you can quickly start using API.
 * @author Siamak Mokhtari <hi@siamak.work>
 * @date 4/26/15.
 */
const axios = require("axios");
var config = require("./config");

/**
 * Constructor for ZarinPal object.
 * @param {String} MerchantID
 * @param {bool} sandbox
 * @param {string} currency
 */
function ZarinPal(MerchantID, sandbox, currency = "IRT") {
  // Validate MerchantID
  if (typeof MerchantID !== "string") {
    throw new Error("MerchantID is invalid");
  }
  if (MerchantID.length === config.merchantIDLength) {
    this.merchant = MerchantID;
  } else {
    console.error(
      "The MerchantID must be " + config.merchantIDLength + " characters."
    );
  }

  this.sandbox = sandbox || false;

  // Validate currency
  const validCurrencies = ["IRR", "IRT"];
  if (!validCurrencies.includes(currency)) {
    console.error("Invalid currency. Valid options are 'IRR' or 'IRT'");
  }

  this.currency = currency || "IRT";

  this.url = sandbox === true ? config.sandbox : config.https;
}

/**
 * Get Authority from ZarinPal
 * @param  {number} Amount [Amount on Tomans.]
 * @param  {String} CallbackURL
 * @param  {String} Description
 * @param  {String} Email
 * @param  {String} Mobile
 */
ZarinPal.prototype.PaymentRequest = function (input) {
  var self = this;

  var params = {
    merchant_id: self.merchant,
    currency: self.currency,
    amount: input.Amount,
    callback_url: input.CallbackURL,
    description: input.Description,
    metadata: { email: input.Email, mobile: input.Mobile },
  };

  var promise = new Promise(function (resolve, reject) {
    self
      .request(self.url, config.API.PR, "POST", params)
      .then(function (data) {
        resolve({
          status: data.code,
          authority: data.authority,
          url: config.PG(self.sandbox) + data.authority,
        });
      })
      .catch(function (err) {
        reject(err);
      });
  });

  return promise;
};

/**
 * Validate Payment from Authority.
 * @param  {number} Amount
 * @param  {String} Authority
 */
ZarinPal.prototype.PaymentVerification = function (input) {
  var self = this;
  var params = {
    merchant_id: self.merchant,
    amount: input.Amount,
    authority: input.Authority,
  };

  var promise = new Promise(function (resolve, reject) {
    self
      .request(self.url, config.API.PV, "POST", params)
      .then(function (data) {
        resolve({
          status: data.code,
          message: data.message,
          cardHash: data.card_hash,
          cardPan: data.card_pan,
          refId: data.ref_id,
          feeType: data.fee_type,
          fee: data.fee,
        });
      })
      .catch(function (err) {
        reject(err);
      });
  });

  return promise;
};

/**
 * Get Unverified Transactions
 * @param  {number} Amount
 * @param  {String} Authority
 */
ZarinPal.prototype.UnverifiedTransactions = function () {
  var self = this;
  var params = {
    merchant_id: self.merchant,
  };

  var promise = new Promise(function (resolve, reject) {
    self
      .request(self.url, config.API.UT, "POST", params)
      .then(function (data) {
        resolve({
          code: data.code,
          message: data.message,
          authorities: data.authorities,
        });
      })
      .catch(function (err) {
        reject(err);
      });
  });

  return promise;
};

/**
 * `request` module with ZarinPal structure.
 * @param  {String}   url
 * @param  {String}   module
 * @param  {String}   method
 * @param  {String}   data
 * @param  {Function} callback
 */
ZarinPal.prototype.request = async function (url, module, method, data) {
  url = url + module;
  try {
    const response = await axios.request({
      url,
      method,
      data,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
    });
    return response.data.data;
  } catch (error) {
    if (error?.response?.data) throw error?.response?.data;
    else throw error;
  }
};

/**
 * Remove EXTRA ooooo!
 * @param {number} token [API response Authority]
 */
ZarinPal.prototype.TokenBeautifier = function (token) {
  return token.split(/\b0+/g);
};

/**
 * Export version module.
 */
exports.version = require("../package.json").version;

/**
 * Create ZarinPal object. Wrapper around constructor.
 */
exports.create = function (MerchantID, sandbox, currency) {
  return new ZarinPal(MerchantID, sandbox, currency);
};
