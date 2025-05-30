// Логирование загрузки модуля
const loadTime = new Date().toISOString();
console.log(`StripeAPITool: Loading module (node-fetch version)... [${loadTime}]`);

const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const fetch = require('node-fetch'); // Убедитесь, что node-fetch установлен

class StripeAPITool extends Tool {
  static lc_name() {
    return 'stripe-payment';
  }

  static forAgents = true;

  constructor(fields = {}) {
    const constructorTime = new Date().toISOString();
    console.log(`StripeAPITool: Constructor called at [${constructorTime}] with fields:`, JSON.stringify(fields, null, 2));
    super(fields);

    this.override = fields.override ?? false;
    this.name = 'stripe-payment';
    this.description = 'A tool to interact with the Stripe API. It can manage customers, invoices, payments, subscriptions, products, and prices.';
    this.description_for_model = `
Stripe API Tool (uses direct HTTP calls):

Manages:
- Customers: getCustomers, getCustomer, createCustomer, updateCustomer, deleteCustomer, searchCustomers
- Products: getProducts, getProduct, createProduct, updateProduct
- Prices: getPrices, getPrice, createPrice, updatePrice
- Invoices:
    - getInvoices, getInvoice, deleteInvoice
    - createInvoice: Creates a new invoice. Can be a draft or finalized. To add items directly during creation, include a 'line_items' array in the 'data' parameter (see 'items' structure below for how to define line_items).
    - updateInvoice: Updates an existing invoice.
    - addInvoiceItemToDraft: ADDS AN ITEM TO AN EXISTING DRAFT INVOICE. Requires 'invoice' (ID of the draft invoice) and item details (see 'items' structure for how to define an item using 'amount', 'data.price', or 'data.product' + 'amount').
    - createPendingInvoiceItem: Creates an item for a customer that will be picked up by the NEXT automatically generated invoice for that customer. Requires 'customer' (Customer ID) and item details.
    - finalizeInvoice: Finalizes a DRAFT invoice. Invoice must have items or it might error.
    - voidInvoice: Voids an OPEN invoice.
    - sendInvoice: Sends an OPEN invoice to the customer.
    - getInvoicePdf
    - createCompleteInvoice: Creates a NEW invoice, adds items to it, and optionally finalizes/sends it. Ideal for a one-shot invoice creation. Requires 'customer' and 'items' array.
- Payments (PaymentIntents): getPayments, getPayment, createPayment
- Refunds: createRefund
- Subscriptions: getSubscriptions, getSubscription, createSubscription, updateSubscription, cancelSubscription
- Utility: checkApiHealth

Key Parameters for most actions:
- 'id': Used for specific entity IDs (e.g., invoiceId for getInvoice, customerId for getCustomer).
- 'customer': Customer ID.
- 'invoice': Invoice ID (specifically for 'addInvoiceItemToDraft').
- 'data': Object for creation/update payloads.
    - For 'createInvoice' or 'createCompleteInvoice', 'data' holds top-level invoice properties (e.g., 'collection_method', 'days_until_due', 'metadata', 'number').
    - For 'createInvoice' to include items at creation: use 'data.line_items' (array of item objects).
    - For 'addInvoiceItemToDraft' or 'createPendingInvoiceItem', 'data' can hold 'price' (ID), 'product' (ID), 'quantity', 'tax_rates', etc. for the item.
- 'items': Array of item objects, PRIMARILY FOR 'createCompleteInvoice' and 'createSubscription'.
    Each 'item' object in the 'items' array for 'createCompleteInvoice' defines a line item and can be structured in one of these ways:
    1. Using an existing Price ID: Set 'item.data.price' to the Price ID (e.g., "price_xxxxxxxx"). 'item.data.quantity' can also be set.
    2. Using an existing Product ID and a new price: Set 'item.data.product' to the Product ID (e.g., "prod_yyyyyyyy") AND provide 'item.amount' (and optionally 'item.currency', 'item.description' for the new price). 'item.data.quantity' can be set.
    3. Creating a new Product and Price on the fly: Provide 'item.amount', 'item.currency', and 'item.description' (for the new product's name). 'item.data.quantity' can be set.
    'item.data' can also include 'tax_rates' (array of tax rate IDs for the line item).
- 'amount', 'currency', 'description': Top-level parameters for 'addInvoiceItemToDraft' or 'createPendingInvoiceItem' if not using 'data.price' or 'data.product'.
- 'auto_advance_and_send': Boolean for 'createCompleteInvoice' to control finalization (via 'auto_advance') and sending.

Workflow for creating an invoice with items:
1. (Preferred for one-shot) 'createCompleteInvoice':
    - Provide 'customer' (ID).
    - Provide 'items' array (structured as described above).
    - Optionally provide 'data' for invoice-level settings (e.g., 'collection_method', 'number', 'metadata').
    - 'auto_advance_and_send' (defaults to true) controls finalization and sending.
2. (Multi-step for more control, e.g. building a draft over time)
    a. 'createCustomer' (if needed).
    b. 'createInvoice': Create a draft invoice for the customer. In 'data', set 'auto_advance: false'.
    c. 'addInvoiceItemToDraft': Call this REPEATEDLY for each item. Provide 'invoice' (ID of draft), and item details (either 'amount'/'currency'/'description' or 'data.price' or 'data.product' + 'amount').
    d. 'finalizeInvoice': Finalize the draft invoice.
    e. 'sendInvoice' (if 'collection_method' is 'send_invoice').

All monetary amounts are in the smallest currency unit (e.g., cents for USD).
For invoices intended for manual payment by customer, set 'collection_method: "send_invoice"' in 'data'.
    `;

    this.isAgent = fields.isAgent ?? false;
    this.apiKey = fields.STRIPE_API_KEY;
    this.baseUrl = 'https://api.stripe.com/v1';

    if (!this.apiKey && !this.override) {
      console.error(`StripeAPITool [${constructorTime}]: CRITICAL - STRIPE_API_KEY is REQUIRED...`);
    } else if (this.apiKey) {
      console.log(`StripeAPITool [${constructorTime}]: STRIPE_API_KEY has been provided and loaded.`);
    } else if (this.override) {
      console.warn(`StripeAPITool [${constructorTime}]: STRIPE_API_KEY is missing, but override is true...`);
    }

    this.schema = z.object({
      action: z.enum([
        'getCustomers', 'getCustomer', 'createCustomer', 'updateCustomer', 'deleteCustomer', 'searchCustomers',
        'getProducts', 'getProduct', 'createProduct', 'updateProduct',
        'getPrices', 'getPrice', 'createPrice', 'updatePrice',
        'getInvoices', 'getInvoice', 'createInvoice', 'updateInvoice', 'deleteInvoice',
        'addInvoiceItemToDraft', 'createPendingInvoiceItem', 'finalizeInvoice', 'voidInvoice', 'sendInvoice', 'getInvoicePdf', 'createCompleteInvoice',
        'getPayments', 'getPayment', 'createPayment',
        'createRefund',
        'getSubscriptions', 'getSubscription', 'createSubscription', 'updateSubscription', 'cancelSubscription',
        'checkApiHealth'
      ]).describe('The action to perform with the Stripe API.'),
      id: z.string().optional().describe('ID for specific operations (e.g., customerId, invoiceId, productId).'),
      limit: z.number().int().min(1).max(100).optional().describe('Limit for listing operations. Default is 10.'),
      data: z.record(z.string().or(z.number()).or(z.boolean()).or(z.null()).or(z.object({})).or(z.array(z.any()))).optional().describe("Data object for create/update operations. Contents depend on the action. For 'createInvoice' or 'createCompleteInvoice', this is for top-level invoice properties. For item-specific methods, 'data' can contain 'price', 'product', 'quantity' etc. for the item."),
      customer: z.string().optional().describe('Customer ID. Often required for creating entities linked to a customer.'),
      invoice: z.string().optional().describe('Invoice ID. Used for actions like adding items to a specific DRAFT invoice.'),
      payment_intent: z.string().optional().describe('PaymentIntent ID for creating refunds.'),
      subscription: z.string().optional().describe('Subscription ID.'),
      product: z.string().optional().describe('Product ID. Used for creating prices or listing prices for a product. Can also be in data.product for createPrice.'),
      price: z.string().optional().describe('Price ID.'),
      amount: z.number().int().optional().describe('Amount for invoice items/payments, in smallest currency unit (cents for USD). Used if not providing a price ID via data.price.'),
      currency: z.string().optional().default('usd').describe('3-letter ISO currency code. Defaults to "usd".'),
      description: z.string().optional().describe('Description for entities.'),
      items: z.array(
        z.object({
          amount: z.number().int().optional().describe('Amount for the item (cents). Use if not providing data.price and not data.product with amount.'),
          currency: z.string().optional().describe('Currency for this item if using amount. Defaults to invoice/subscription currency or "usd".'),
          description: z.string().optional().describe('Description for this item, often used for product_data if creating a price on the fly.'),
          data: z.record(z.string().or(z.number()).or(z.boolean()).or(z.null()).or(z.array(z.any()))).optional().describe("Additional data for this specific item. Can include 'price' (Price ID), 'product' (Product ID to be used with top-level 'amount'), 'quantity', 'tax_rates'."),
        })
      ).optional().describe("Array of items for 'createCompleteInvoice' or 'createSubscription'. Structure of each item is described in the main tool description."),
      auto_advance_and_send: z.boolean().optional().default(true).describe("For 'createCompleteInvoice': if true, sets 'auto_advance:true' on invoice creation and attempts to send it if applicable."),
      query: z.string().optional().describe('Search query for search operations (e.g., for customers).'),
      expand: z.array(z.string()).optional().describe('List of fields to expand in the response (e.g., ["customer", "lines"]).'),
    }).describe('Input schema for the StripeAPITool...');

    console.log(`StripeAPITool [${constructorTime}]: Schema defined. Initialization complete (using node-fetch). Agent mode: ${this.isAgent}`);
  }

  returnValue(value) {
    const responseString = typeof value === 'string' ? value : JSON.stringify(value);
    if (this.isAgent) return [responseString, {}];
    return responseString;
  }

  _validateParams(params) {
    const { action, id, customer, invoice, payment_intent, product, items, query, data, amount } = params;

    if (['getCustomer', 'updateCustomer', 'deleteCustomer', 
         'getInvoice', 'updateInvoice', 'deleteInvoice', 'finalizeInvoice', 'voidInvoice', 'sendInvoice', 'getInvoicePdf',
         'getPayment', 
         'getSubscription', 'updateSubscription', 'cancelSubscription',
         'getProduct', 'updateProduct',
         'getPrice', 'updatePrice'].includes(action) && !id) {
      throw new Error(`Parameter "id" (for the respective entity) is required for action: ${action}`);
    }
    if (action === 'createInvoice' && !customer) throw new Error('Parameter "customer" (Customer ID) is required for createInvoice.');
    
    if (action === 'addInvoiceItemToDraft') {
        if (!invoice) throw new Error('Parameter "invoice" (ID of the DRAFT invoice) is required for addInvoiceItemToDraft.');
        if (amount === undefined && !data?.price && !(data?.product && (amount !== undefined || data?.amount !== undefined)) && data?.amount === undefined) {
            throw new Error('For addInvoiceItemToDraft, provide "amount", or "data.price", or ("data.product" and "amount"/"data.amount").');
        }
    }
    if (action === 'createPendingInvoiceItem') {
        if (!customer) throw new Error('Parameter "customer" (Customer ID) is required for createPendingInvoiceItem.');
         if (amount === undefined && !data?.price && !(data?.product && (amount !== undefined || data?.amount !== undefined)) && data?.amount === undefined) {
            throw new Error('For createPendingInvoiceItem, provide "amount", or "data.price", or ("data.product" and "amount"/"data.amount").');
        }
    }

    if (action === 'createCompleteInvoice' && (!customer || !items || items.length === 0)) {
      throw new Error('Parameter "customer" (Customer ID) and at least one item in "items" are required for createCompleteInvoice.');
    }
    if (action === 'createRefund' && !payment_intent) {
      throw new Error('Parameter "payment_intent" (PaymentIntent ID) is required for createRefund.');
    }
    if (action === 'createSubscription' && (!customer || !items || items.length === 0)) {
      throw new Error('Parameter "customer" (Customer ID) and "items" (array, each item typically with "data.price") are required for createSubscription.');
    }
    if (action === 'createPrice' && (!product && !data?.product)) { // product can be top-level or in data
      throw new Error('Parameter "product" (Product ID, passed either as top-level "product" or in "data.product") is required for createPrice.');
    }
    if (action === 'searchCustomers' && !query) {
      throw new Error('Parameter "query" is required for searchCustomers.');
    }
  }

  async _call(input) {
    const callTime = new Date().toISOString();
    console.log(`StripeAPITool: _call invoked at [${callTime}] with input:`, JSON.stringify(input, null, 2));

    if (!this.apiKey && !this.override) {
      const errorMsg = "StripeAPITool Error: STRIPE_API_KEY is not configured...";
      console.error(`StripeAPITool [${callTime}]: ${errorMsg}`);
      return this.returnValue({ error: true, message: errorMsg });
    }

    try {
      const params = input;
      let result;
      this._validateParams(params); 

      switch (params.action) {
        case 'getCustomers': result = await this.getCustomers(params.limit, params.expand); break;
        case 'getCustomer': result = await this.getCustomer(params.id, params.expand); break;
        case 'createCustomer': result = await this.createCustomer(params.data || {}); break;
        case 'updateCustomer': result = await this.updateCustomer(params.id, params.data || {}); break;
        case 'deleteCustomer': result = await this.deleteCustomer(params.id); break;
        case 'searchCustomers': result = await this.searchCustomers(params.query, params.limit, params.expand); break;
        
        case 'getProducts': result = await this.getProducts(params.limit, params.expand); break;
        case 'getProduct': result = await this.getProduct(params.id, params.expand); break;
        case 'createProduct': result = await this.createProduct(params.data || {}); break;
        case 'updateProduct': result = await this.updateProduct(params.id, params.data || {}); break;

        case 'getPrices': result = await this.getPrices(params.limit, params.product, params.expand); break;
        case 'getPrice': result = await this.getPrice(params.id, params.expand); break;
        case 'createPrice': result = await this.createPrice(params.data || {}, params.product); break; 
        case 'updatePrice': result = await this.updatePrice(params.id, params.data || {}); break;

        case 'getInvoices': result = await this.getInvoices(params.limit, params.customer, params.expand); break;
        case 'getInvoice': result = await this.getInvoice(params.id, params.expand); break;
        case 'createInvoice': result = await this.createInvoice(params.customer, params.data || {}); break;
        case 'updateInvoice': result = await this.updateInvoice(params.id, params.data || {}); break;
        case 'deleteInvoice': result = await this.deleteInvoice(params.id); break;
        case 'addInvoiceItemToDraft': 
          result = await this.addInvoiceItemToDraft(params.invoice, params.amount, params.currency, params.description, params.data || {}); 
          break;
        case 'createPendingInvoiceItem':
          result = await this.createPendingInvoiceItem(params.customer, params.amount, params.currency, params.description, params.data || {});
          break;
        case 'finalizeInvoice': result = await this.finalizeInvoice(params.id); break;
        case 'voidInvoice': result = await this.voidInvoice(params.id); break;
        case 'sendInvoice': result = await this.sendInvoice(params.id); break; 
        case 'getInvoicePdf': result = await this.getInvoicePdf(params.id); break; 
        case 'createCompleteInvoice':
          result = await this.createCompleteInvoice(params.customer, params.items, params.auto_advance_and_send, params.data || {});
          break;
          
        case 'getPayments': result = await this.getPayments(params.limit, params.customer, params.expand); break;
        case 'getPayment': result = await this.getPayment(params.id, params.expand); break; 
        case 'createPayment': result = await this.createPayment(params.data || {}); break;
        
        case 'createRefund': result = await this.createRefund(params.payment_intent, params.amount, params.data || {}); break;
        
        case 'getSubscriptions': result = await this.getSubscriptions(params.limit, params.customer, params.expand); break;
        case 'getSubscription': result = await this.getSubscription(params.id, params.expand); break; 
        case 'createSubscription': result = await this.createSubscription(params.customer, params.items, params.data || {}); break;
        case 'updateSubscription': result = await this.updateSubscription(params.id, params.data || {}); break; 
        case 'cancelSubscription': result = await this.cancelSubscription(params.id, params.data || {}); break; 
        
        case 'checkApiHealth': result = await this.checkApiHealth(); break;
        
        default:
          throw new Error(`Unknown or unsupported action: ${params.action}`);
      }
      
      console.log(`StripeAPITool [${callTime}]: Action "${params.action}" executed successfully.`);
      return this.returnValue(result);
    } catch (error) {
      const errorMessage = error.response?.data?.error?.message || error.message; 
      console.error(`StripeAPITool [${callTime}]: Error during action "${input.action}". Message: ${errorMessage}`, "Stack:", error.stack ? error.stack.substring(0, 700) : "No stack", "Input:", JSON.stringify(input));
      return this.returnValue({ error: true, action: input.action, message: `Error processing Stripe action "${input.action}": ${errorMessage}` });
    }
  }

  async callAPI({ path, method = 'GET', data = null, queryParams = null, responseFormat = 'json', expand = null }) {
    const callTime = new Date().toISOString();
    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': '2024-04-10' 
    };

    let fullPath = path;
    const finalQueryParams = { ...(queryParams || {}) };
    if (expand && Array.isArray(expand) && expand.length > 0) {
      expand.forEach((field, index) => {
        finalQueryParams[`expand[${index}]`] = field;
      });
    }

    if (Object.keys(finalQueryParams).length > 0) {
      const definedQueryParams = {};
      for (const key in finalQueryParams) {
        if (finalQueryParams[key] !== undefined) definedQueryParams[key] = finalQueryParams[key];
      }
      const queryString = new URLSearchParams(definedQueryParams).toString();
      if (queryString) fullPath += `?${queryString}`;
    }
    
    const url = `${this.baseUrl}${fullPath}`;

    const fetchOptions = { method, headers };

    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      const formData = new URLSearchParams();
      const appendFormData = (dataObj, parentKey = null) => {
        for (const key in dataObj) {
          if (Object.prototype.hasOwnProperty.call(dataObj, key)) {
            const value = dataObj[key];
            const formKey = parentKey ? `${parentKey}[${key}]` : key;
            if (value === null || value === undefined) { 
              // formData.append(formKey, ''); // Stripe often omits undefined/null
            } else if (typeof value === 'object' && !Array.isArray(value)) { 
              appendFormData(value, formKey); 
            } else if (Array.isArray(value)) {
              value.forEach((item, index) => {
                if (typeof item === 'object' && item !== null) {
                    appendFormData(item, `${formKey}[${index}]`);
                } else if (item !== undefined) {
                    formData.append(`${formKey}[${index}]`, item);
                }
              });
            } else { 
              formData.append(formKey, value); 
            }
          }
        }
      };
      appendFormData(data);
      fetchOptions.body = formData.toString();
      // console.log(`StripeAPITool [${callTime}]: API Call ${method} ${url} with body: ${fetchOptions.body}`);
    } else {
      // console.log(`StripeAPITool [${callTime}]: API Call ${method} ${url}`);
    }


    const response = await fetch(url, fetchOptions);

    if (responseFormat === 'pdf') {
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`StripeAPITool [${callTime}]: PDF API call failed. Status: ${response.status}, Text: ${errorText.substring(0,500)}`);
        throw new Error(`Stripe API error ${method} ${url}: ${response.status} ${response.statusText}. Error: ${errorText.substring(0,200)}`);
      }
      const buffer = await response.arrayBuffer();
      return { buffer: Buffer.from(buffer), contentType: response.headers.get('content-type') };
    }

    const responseText = await response.text();
    let responseData;
    try { 
      responseData = JSON.parse(responseText); 
    } catch (e) {
      if (!response.ok) {
        console.error(`StripeAPITool [${callTime}]: API call failed non-JSON. Status: ${response.status}, Text: ${responseText.substring(0,500)}`);
        throw new Error(`Stripe API error ${method} ${url}: ${response.status} ${response.statusText}. Non-JSON: ${responseText.substring(0,200)}`);
      }
      if (response.status === 204) return { deleted: true, status: response.status }; 
      return { success: true, status: response.status, data: responseText }; 
    }

    if (!response.ok) {
      const errorMsg = responseData.error?.message || JSON.stringify(responseData.error) || 'Unknown Stripe API error';
      console.error(`StripeAPITool [${callTime}]: API Error ${response.status} for ${method} ${url}. Message: ${errorMsg}`, "Full Response:", JSON.stringify(responseData, null, 2).substring(0, 1000));
      const err = new Error(errorMsg);
      err.response = { status: response.status, data: responseData };
      throw err;
    }
    return responseData;
  }

  async getCustomers(limit = 10, expand) { return this.callAPI({ path: '/customers', queryParams: { limit }, expand }); }
  async getCustomer(id, expand) { return this.callAPI({ path: `/customers/${id}`, queryParams: {}, expand }); }
  async createCustomer(data) { return this.callAPI({ path: '/customers', method: 'POST', data }); }
  async updateCustomer(id, data) { return this.callAPI({ path: `/customers/${id}`, method: 'POST', data }); }
  async deleteCustomer(id) { return this.callAPI({ path: `/customers/${id}`, method: 'DELETE' }); }
  async searchCustomers(query, limit = 10, expand) { return this.callAPI({ path: '/customers/search', queryParams: { query, limit }, expand }); }

  async getProducts(limit = 10, expand) { return this.callAPI({ path: '/products', queryParams: { limit }, expand }); }
  async getProduct(id, expand) { return this.callAPI({ path: `/products/${id}`, queryParams: {}, expand }); }
  async createProduct(data) { return this.callAPI({ path: '/products', method: 'POST', data }); }
  async updateProduct(id, data) { return this.callAPI({ path: `/products/${id}`, method: 'POST', data }); }

  async getPrices(limit = 10, productId, expand) { return this.callAPI({ path: '/prices', queryParams: { limit, product: productId }, expand }); }
  async getPrice(id, expand) { return this.callAPI({ path: `/prices/${id}`, queryParams: {}, expand }); }
  async createPrice(data, topLevelProductId) { // data should contain product ID if topLevelProductId is not given
    const priceData = {...data};
    if (topLevelProductId && !priceData.product) {
        priceData.product = topLevelProductId;
    }
    if (!priceData.product) throw new Error("Product ID is required to create a price, either in 'data.product' or as a separate parameter.");
    return this.callAPI({ path: '/prices', method: 'POST', data: priceData });
  }
  async updatePrice(id, data) { return this.callAPI({ path: `/prices/${id}`, method: 'POST', data }); }

  async getInvoices(limit = 10, customerId, expand) { return this.callAPI({ path: '/invoices', queryParams: { limit, customer: customerId }, expand }); }
  async getInvoice(id, expand) { return this.callAPI({ path: `/invoices/${id}`, queryParams: {}, expand }); }
  async createInvoice(customerId, data = {}) {
    const invoiceData = { customer: customerId, ...data };
    if (invoiceData.collection_method === 'send_invoice' && !invoiceData.days_until_due && !invoiceData.due_date) {
        invoiceData.days_until_due = 7;
    }
    console.log(`StripeAPITool: Calling createInvoice for customer ${customerId} with data:`, JSON.stringify(invoiceData));
    return this.callAPI({ path: '/invoices', method: 'POST', data: invoiceData });
  }
  async updateInvoice(id, data) { return this.callAPI({ path: `/invoices/${id}`, method: 'POST', data }); }
  async deleteInvoice(id) { return this.callAPI({ path: `/invoices/${id}`, method: 'DELETE' }); }

  async addInvoiceItemToDraft(invoiceId, amount, currency = 'usd', description, itemSpecificData = {}) {
    const data = { invoice: invoiceId, ...(itemSpecificData || {}) };
    if (itemSpecificData.price) { /* Price ID is in data.price */ }
    else if (itemSpecificData.product && (itemSpecificData.amount !== undefined || amount !== undefined)) {
        data.price_data = {
            currency: itemSpecificData.currency || currency,
            unit_amount: itemSpecificData.amount !== undefined ? itemSpecificData.amount : amount,
            product: itemSpecificData.product,
        };
        delete data.amount; delete data.currency; delete data.product;
    } else if (amount !== undefined) {
        data.amount = amount;
        data.currency = itemSpecificData.currency || currency;
    } else if (itemSpecificData.amount !== undefined) { // if amount is in itemSpecificData
        data.amount = itemSpecificData.amount;
        data.currency = itemSpecificData.currency || currency;
    } else {
        throw new Error("StripeAPITool: addInvoiceItemToDraft - Item details insufficient. Need 'amount', 'data.price', or ('data.product' + 'amount'/'data.amount').");
    }
    if (description && data.description === undefined) data.description = description;
    if (data.product && data.price_data?.product) delete data.product;

    console.log(`StripeAPITool: Calling addInvoiceItemToDraft for DRAFT invoice ${invoiceId} with data:`, JSON.stringify(data));
    return this.callAPI({ path: '/invoiceitems', method: 'POST', data });
  }

  async createPendingInvoiceItem(customerId, amount, currency = 'usd', description, itemSpecificData = {}) {
    const data = { customer: customerId, ...(itemSpecificData || {}) };
    if (itemSpecificData.price) { /* Price ID is in data.price */ }
    else if (itemSpecificData.product && (itemSpecificData.amount !== undefined || amount !== undefined)) {
        data.price_data = {
            currency: itemSpecificData.currency || currency,
            unit_amount: itemSpecificData.amount !== undefined ? itemSpecificData.amount : amount,
            product: itemSpecificData.product,
        };
        delete data.amount; delete data.currency; delete data.product;
    } else if (amount !== undefined) {
        data.amount = amount;
        data.currency = itemSpecificData.currency || currency;
    } else if (itemSpecificData.amount !== undefined) {
        data.amount = itemSpecificData.amount;
        data.currency = itemSpecificData.currency || currency;
    } else {
        throw new Error("StripeAPITool: createPendingInvoiceItem - Item details insufficient.");
    }
    if (description && data.description === undefined) data.description = description;
    if (data.product && data.price_data?.product) delete data.product;

    console.log(`StripeAPITool: Calling createPendingInvoiceItem for customer ${customerId} with data:`, JSON.stringify(data));
    return this.callAPI({ path: '/invoiceitems', method: 'POST', data });
  }

  async finalizeInvoice(id) { return this.callAPI({ path: `/invoices/${id}/finalize`, method: 'POST' }); }
  async voidInvoice(id) { return this.callAPI({ path: `/invoices/${id}/void`, method: 'POST'}); }
  async sendInvoice(invoiceId) { return this.callAPI({ path: `/invoices/${invoiceId}/send`, method: 'POST' }); }
  async getInvoicePdf(invoiceId) { return this.callAPI({ path: `/invoices/${invoiceId}/pdf`, responseFormat: 'pdf' }); }

  async createCompleteInvoice(customerId, items, autoAdvanceAndSend = true, invoiceData = {}) {
    const callTime = new Date().toISOString();
    console.log(`StripeAPITool [${callTime}]: createCompleteInvoice. Customer: ${customerId}, Items: ${items?.length}, AutoAdvanceAndSend: ${autoAdvanceAndSend}, InvoiceData: ${JSON.stringify(invoiceData)}`);

    const line_items_for_invoice = items.map(item => {
        const line_item_payload = { ...(item.data || {}) }; // Start with item.data (could have quantity, tax_rates, price, product)
        
        if (line_item_payload.price) { // Case 1: Existing Price ID provided in item.data.price
            // quantity can be in line_item_payload.quantity
        } else if (line_item_payload.product && item.amount !== undefined) { // Case 2: Existing Product ID + new price
            line_item_payload.price_data = {
                currency: item.currency || invoiceData.currency || 'usd',
                unit_amount: item.amount,
                product: line_item_payload.product,
            };
            delete line_item_payload.product; // Remove from top-level of line_item_payload as it's now in price_data
        } else if (item.amount !== undefined) { // Case 3: New Product and Price on the fly
            line_item_payload.price_data = {
                currency: item.currency || invoiceData.currency || 'usd',
                unit_amount: item.amount,
                product_data: { name: item.description || 'Unnamed Item' },
            };
        } else {
            throw new Error("StripeAPITool: createCompleteInvoice - Each item must have 'item.amount' OR 'item.data.price' (Price ID) OR ('item.data.product' AND 'item.amount').");
        }

        if (item.description && line_item_payload.description === undefined && !line_item_payload.price_data?.product_data?.name) {
            line_item_payload.description = item.description; // Add description to line item if not set by product_data
        }
        if (line_item_payload.quantity === undefined) line_item_payload.quantity = 1; // Default quantity

        return line_item_payload;
    });

    const finalInvoiceData = {
      customer: customerId,
      line_items: line_items_for_invoice,
      auto_advance: autoAdvanceAndSend, // This tells Stripe to try to finalize
      collection_method: invoiceData.collection_method || 'send_invoice',
      ...invoiceData, 
    };
    delete finalInvoiceData.items; // Ensure 'items' from input doesn't conflict with 'line_items'

    if (finalInvoiceData.collection_method === 'send_invoice' && !finalInvoiceData.days_until_due && !finalInvoiceData.due_date) {
      finalInvoiceData.days_until_due = 7;
    }
    if (invoiceData.number) finalInvoiceData.number = invoiceData.number;

    let invoice = await this.callAPI({ path: '/invoices', method: 'POST', data: finalInvoiceData });
    console.log(`StripeAPITool [${callTime}]: Invoice ${invoice.id} created. Status: ${invoice.status}, Collection: ${invoice.collection_method}, Amount Due: ${invoice.amount_due}`);
    
    // If auto_advance was true, Stripe should have attempted to finalize.
    // If it's still draft (e.g., needs more info, or auto_advance was overridden to false by Stripe for some reason),
    // and user intended to finalize (autoAdvanceAndSend = true), try finalizing explicitly.
    if (autoAdvanceAndSend && invoice.status === 'draft' && invoice.amount_due > 0) { // Only finalize if there's an amount due
        try {
            console.log(`StripeAPITool [${callTime}]: Invoice ${invoice.id} is draft with amount ${invoice.amount_due}, attempting to finalize explicitly.`);
            invoice = await this.finalizeInvoice(invoice.id);
            console.log(`StripeAPITool [${callTime}]: Invoice ${invoice.id} after explicit finalize. Status: ${invoice.status}`);
        } catch (finalizeError) {
            console.error(`StripeAPITool [${callTime}]: Failed to explicitly finalize invoice ${invoice.id}. Error: ${finalizeError.message}.`);
            // If finalization fails, we probably shouldn't try to send.
        }
    }
    
    if (
      autoAdvanceAndSend && 
      invoice.status === 'open' && 
      invoice.collection_method === 'send_invoice' &&
      invoiceData.send_immediately !== false
    ) {
      console.log(`StripeAPITool [${callTime}]: Sending invoice ${invoice.id}`);
      const sentInvoice = await this.sendInvoice(invoice.id); 
      // Use the result of getInvoice to ensure we have the latest full object if sendInvoice result is minimal
      invoice = await this.getInvoice(invoice.id, invoiceData.expand); 
      console.log(`StripeAPITool [${callTime}]: Invoice ${invoice.id} sent. Status: ${invoice.status}, Hosted URL: ${invoice.hosted_invoice_url || sentInvoice.hosted_invoice_url}`);
    } else {
        console.log(`StripeAPITool [${callTime}]: Conditions for sending invoice ${invoice.id} not met or not applicable. Status: ${invoice.status}, Collection: ${invoice.collection_method}, Amount Due: ${invoice.amount_due}`);
    }
    return invoice;
  }

  async getPayments(limit = 10, customerId, expand) { return this.callAPI({ path: '/payment_intents', queryParams: { limit, customer: customerId }, expand }); }
  async getPayment(id, expand) { return this.callAPI({ path: `/payment_intents/${id}`, queryParams: {}, expand }); }
  async createPayment(data) { return this.callAPI({ path: '/payment_intents', method: 'POST', data }); }

  async createRefund(paymentIntentId, amount, data = {}) {
    const refundData = { payment_intent: paymentIntentId, ...data };
    if (amount !== null && amount !== undefined) refundData.amount = amount;
    return this.callAPI({ path: '/refunds', method: 'POST', data: refundData });
  }

  async getSubscriptions(limit = 10, customerId, expand) { return this.callAPI({ path: '/subscriptions', queryParams: { limit, customer: customerId }, expand }); }
  async getSubscription(id, expand) { return this.callAPI({ path: `/subscriptions/${id}`, queryParams: {}, expand }); }
  async createSubscription(customerId, items, data = {}) { 
    const subData = { customer: customerId, items: items, ...data };
    return this.callAPI({ path: '/subscriptions', method: 'POST', data: subData });
  }
  async updateSubscription(id, data) { return this.callAPI({ path: `/subscriptions/${id}`, method: 'POST', data }); }
  async cancelSubscription(id, data = {}) { return this.callAPI({ path: `/subscriptions/${id}`, method: 'DELETE', data }); }

  async checkApiHealth() {
    try {
      await this.callAPI({ path: '/balance', method: 'GET' }); 
      return { status: 'healthy', timestamp: new Date().toISOString() };
    } catch (error) {
      return { status: 'unhealthy', error: error.message, timestamp: new Date().toISOString() };
    }
  }
}

module.exports = StripeAPITool;
const exportTime = new Date().toISOString();
console.log(`StripeAPITool: Module exported (node-fetch version). [${exportTime}]`); 