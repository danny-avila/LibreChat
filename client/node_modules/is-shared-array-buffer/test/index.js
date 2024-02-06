'use strict';

var test = require('tape');
var inspect = require('object-inspect');
var forEach = require('for-each');
var v = require('es-value-fixtures');

var isSharedArrayBuffer = require('..');

test('isSharedArrayBuffer', function (t) {
	t.equal(typeof isSharedArrayBuffer, 'function', 'is a function');

	var nonSABs = v.primitives.concat(v.objects);
	forEach(nonSABs, function (nonSAB) {
		t.equal(isSharedArrayBuffer(nonSAB), false, inspect(nonSAB) + ' is not a SharedArrayBuffer');
	});

	t.test('actual SharedArrayBuffer instances', { skip: typeof SharedArrayBuffer === 'undefined' }, function (st) {
		var sab = new SharedArrayBuffer();

		st.equal(isSharedArrayBuffer(sab), true, inspect(sab) + ' is a SharedArrayBuffer');

		st.end();
	});

	t.end();
});
