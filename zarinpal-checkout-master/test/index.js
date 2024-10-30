'use strict';

var should           = require('chai').should();
var ZarinpalCheckout = require('../index');

describe('ZarinpalCheckout', function() {
	it('should exist', function() {
		return ZarinpalCheckout.should.exist;
	});
	it('should be able to create module', function () {
		return ZarinpalCheckout.create('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', false);
	});
	it('should be able to get authority', function() {
		var zarinpal = ZarinpalCheckout.create('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', false);
		zarinpal.PaymentRequest({
			Amount: '1000',
			CallbackURL: 'http://siamak.us',
			Description: 'Hello NodeJS API.',
			Email: 'hi@siamak.work',
			Mobile: '09120000000'
		}).then(function (response) {
			response.status.should.be.eq(100);
		});
  });
});
