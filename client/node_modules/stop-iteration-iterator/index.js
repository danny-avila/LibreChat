'use strict';

var SLOT = require('internal-slot');

var $SyntaxError = SyntaxError;
var $StopIteration = typeof StopIteration === 'object' ? StopIteration : null;

module.exports = function getStopIterationIterator(origIterator) {
	if (!$StopIteration) {
		throw new $SyntaxError('this environment lacks StopIteration');
	}

	SLOT.set(origIterator, '[[Done]]', false);

	var siIterator = {
		next: function next() {
			var iterator = SLOT.get(this, '[[Iterator]]');
			var done = SLOT.get(iterator, '[[Done]]');
			try {
				return {
					done: done,
					value: done ? void undefined : iterator.next()
				};
			} catch (e) {
				SLOT.set(iterator, '[[Done]]', true);
				if (e !== $StopIteration) {
					throw e;
				}
				return {
					done: true,
					value: void undefined
				};
			}
		}
	};

	SLOT.set(siIterator, '[[Iterator]]', origIterator);

	return siIterator;
};
