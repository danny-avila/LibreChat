# ZarinPal Checkout: [![Build Status](https://travis-ci.org/siamak/zarinpal-checkout.svg?branch=master)](https://travis-ci.org/siamak/zarinpal-checkout)

[ZarinPal Checkout](https://www.zarinpal.com/) implementation in Node.JS

- Easy to Use
- Promises/A+ Compatible
- Sandboxing

## 🕹 Usage

Install the package from `npm` or `yarn` and require it in your Node project:

```bash
npm install zarinpal-checkout
# or
yarn add zarinpal-checkout
```

```javascript
const ZarinpalCheckout = require("zarinpal-checkout");
// or
import ZarinPalCheckout from "zarinpal-checkout";
```

Then create an instance:

```javascript
/**
 * Create ZarinPal
 * @param {String} `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` [Merchant ID]
 * @param {Boolean} false [toggle `Sandbox` mode]
 * @param {String} `IRR` or `IRT` [Currency - For default `IRT`]
 */
const zarinpal = ZarinpalCheckout.create(
  "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  false,
  "IRT"
);
```

## Typescript Definitions

```bash
npm install @types/zarinpal-checkout
# or
yarn add @types/zarinpal-checkout
```

Definitions are currently maintained in the [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/zarinpal-checkout) repo.

## 📢 API

### ★ Payment Request:

```javascript
/**
 * PaymentRequest [module]
 * @return {String} URL [Payement Authority]
 */
zarinpal
  .PaymentRequest({
    Amount: "1000", // In Tomans
    CallbackURL: "https://your-safe-api/example/zarinpal/validate",
    Description: "A Payment from Node.JS",
    Email: "hi@siamak.work",
    Mobile: "09120000000",
  })
  .then((response) => {
    if (response.status === 100) {
      console.log(response.url);
    }
  })
  .catch((err) => {
    console.error(err);
  });
```

### ★ Payment Verification:

```javascript
zarinpal
  .PaymentVerification({
    Amount: "1000", // In Tomans
    Authority: "000000000000000000000000000000000000",
  })
  .then((response) => {
    if (response.status !== 100) {
      console.log("Empty!");
    } else {
      console.log(`Verified! Ref ID: ${response.RefID}`);
    }
  })
  .catch((err) => {
    console.error(err);
  });
```

### ★ Unverified Transactions:

```javascript
zarinpal.UnverifiedTransactions().then(response =>
  if (response.status === 100) {
    console.log(response.authorities);
  }
}).catch(err => {
  console.error(err);
});
```

### ★ Refresh Authority:

```javascript
zarinpal
  .RefreshAuthority({
    Authority: "000000000000000000000000000000000000",
    Expire: "1800",
  })
  .then((response) => {
    if (response.status === 100) {
      console.log(response.status);
    }
  })
  .catch((err) => {
    console.error(err);
  });
```

### 🍦🍦🍦 [DEMO: ZarinPal Express checkout](https://github.com/siamakmokhtari/zarinpal-express-checkout).

---

## 🔆 To-Do

- [ ] Add Extra mode for API.
- [x] Promises/A+
- [x] Unit testing `mocha`.

## 👋 Contribution

Contributions are welcome. Please submit PRs or just file an issue if you see something broken or in
need of improving.

## 🍀 License

This software is released under the [MIT License](http://siamak.mit-license.org).

```
The MIT License (MIT)

Copyright (c) 2015-2017 Siamak Mokhtari s.mokhtari75@gmail.com

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```
