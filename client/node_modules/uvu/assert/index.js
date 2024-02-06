const { dequal } = require('dequal');
const { compare, lines } = require('uvu/diff');

function dedent(str) {
	str = str.replace(/\r?\n/g, '\n');
  let arr = str.match(/^[ \t]*(?=\S)/gm);
  let i = 0, min = 1/0, len = (arr||[]).length;
  for (; i < len; i++) min = Math.min(min, arr[i].length);
  return len && min ? str.replace(new RegExp(`^[ \\t]{${min}}`, 'gm'), '') : str;
}

class Assertion extends Error {
	constructor(opts={}) {
		super(opts.message);
		this.name = 'Assertion';
		this.code = 'ERR_ASSERTION';
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, this.constructor);
		}
		this.details = opts.details || false;
		this.generated = !!opts.generated;
		this.operator = opts.operator;
		this.expects = opts.expects;
		this.actual = opts.actual;
	}
}

function assert(bool, actual, expects, operator, detailer, backup, msg) {
	if (bool) return;
	let message = msg || backup;
	if (msg instanceof Error) throw msg;
	let details = detailer && detailer(actual, expects);
	throw new Assertion({ actual, expects, operator, message, details, generated: !msg });
}

function ok(val, msg) {
	assert(!!val, false, true, 'ok', false, 'Expected value to be truthy', msg);
}

function is(val, exp, msg) {
	assert(val === exp, val, exp, 'is', compare, 'Expected values to be strictly equal:', msg);
}

function equal(val, exp, msg) {
	assert(dequal(val, exp), val, exp, 'equal', compare, 'Expected values to be deeply equal:', msg);
}

function unreachable(msg) {
	assert(false, true, false, 'unreachable', false, 'Expected not to be reached!', msg);
}

function type(val, exp, msg) {
	let tmp = typeof val;
	assert(tmp === exp, tmp, exp, 'type', false, `Expected "${tmp}" to be "${exp}"`, msg);
}

function instance(val, exp, msg) {
	let name = '`' + (exp.name || exp.constructor.name) + '`';
	assert(val instanceof exp, val, exp, 'instance', false, `Expected value to be an instance of ${name}`, msg);
}

function match(val, exp, msg) {
	if (typeof exp === 'string') {
		assert(val.includes(exp), val, exp, 'match', false, `Expected value to include "${exp}" substring`, msg);
	} else {
		assert(exp.test(val), val, exp, 'match', false, `Expected value to match \`${String(exp)}\` pattern`, msg);
	}
}

function snapshot(val, exp, msg) {
	val=dedent(val); exp=dedent(exp);
	assert(val === exp, val, exp, 'snapshot', lines, 'Expected value to match snapshot:', msg);
}

const lineNums = (x, y) => lines(x, y, 1);
function fixture(val, exp, msg) {
	val=dedent(val); exp=dedent(exp);
	assert(val === exp, val, exp, 'fixture', lineNums, 'Expected value to match fixture:', msg);
}

function throws(blk, exp, msg) {
	if (!msg && typeof exp === 'string') {
		msg = exp; exp = null;
	}

	try {
		blk();
		assert(false, false, true, 'throws', false, 'Expected function to throw', msg);
	} catch (err) {
		if (err instanceof Assertion) throw err;

		if (typeof exp === 'function') {
			assert(exp(err), false, true, 'throws', false, 'Expected function to throw matching exception', msg);
		} else if (exp instanceof RegExp) {
			assert(exp.test(err.message), false, true, 'throws', false, `Expected function to throw exception matching \`${String(exp)}\` pattern`, msg);
		}
	}
}

// ---

function not(val, msg) {
	assert(!val, true, false, 'not', false, 'Expected value to be falsey', msg);
}

not.ok = not;

is.not = function (val, exp, msg) {
	assert(val !== exp, val, exp, 'is.not', false, 'Expected values not to be strictly equal', msg);
}

not.equal = function (val, exp, msg) {
	assert(!dequal(val, exp), val, exp, 'not.equal', false, 'Expected values not to be deeply equal', msg);
}

not.type = function (val, exp, msg) {
	let tmp = typeof val;
	assert(tmp !== exp, tmp, exp, 'not.type', false, `Expected "${tmp}" not to be "${exp}"`, msg);
}

not.instance = function (val, exp, msg) {
	let name = '`' + (exp.name || exp.constructor.name) + '`';
	assert(!(val instanceof exp), val, exp, 'not.instance', false, `Expected value not to be an instance of ${name}`, msg);
}

not.snapshot = function (val, exp, msg) {
	val=dedent(val); exp=dedent(exp);
	assert(val !== exp, val, exp, 'not.snapshot', false, 'Expected value not to match snapshot', msg);
}

not.fixture = function (val, exp, msg) {
	val=dedent(val); exp=dedent(exp);
	assert(val !== exp, val, exp, 'not.fixture', false, 'Expected value not to match fixture', msg);
}

not.match = function (val, exp, msg) {
	if (typeof exp === 'string') {
		assert(!val.includes(exp), val, exp, 'not.match', false, `Expected value not to include "${exp}" substring`, msg);
	} else {
		assert(!exp.test(val), val, exp, 'not.match', false, `Expected value not to match \`${String(exp)}\` pattern`, msg);
	}
}

not.throws = function (blk, exp, msg) {
	if (!msg && typeof exp === 'string') {
		msg = exp; exp = null;
	}

	try {
		blk();
	} catch (err) {
		if (typeof exp === 'function') {
			assert(!exp(err), true, false, 'not.throws', false, 'Expected function not to throw matching exception', msg);
		} else if (exp instanceof RegExp) {
			assert(!exp.test(err.message), true, false, 'not.throws', false, `Expected function not to throw exception matching \`${String(exp)}\` pattern`, msg);
		} else if (!exp) {
			assert(false, true, false, 'not.throws', false, 'Expected function not to throw', msg);
		}
	}
}

exports.Assertion = Assertion;
exports.equal = equal;
exports.fixture = fixture;
exports.instance = instance;
exports.is = is;
exports.match = match;
exports.not = not;
exports.ok = ok;
exports.snapshot = snapshot;
exports.throws = throws;
exports.type = type;
exports.unreachable = unreachable;