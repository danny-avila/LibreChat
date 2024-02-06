import isIntersectionObserverAvailable from './intersection-observer';

describe('isIntersectionObserverAvailable', function() {
	it('returns true if IntersectionObserver is available', function() {
		window.IntersectionObserver = {};
		window.IntersectionObserverEntry = {
			prototype: {
				isIntersecting: () => null,
			},
		};

		expect(isIntersectionObserverAvailable()).toBe(true);
	});

	it('returns false if IntersectionObserver is not available', function() {
		delete window.IntersectionObserver;
		window.IntersectionObserverEntry = {
			prototype: {},
		};
		delete window.IntersectionObserverEntry;

		expect(isIntersectionObserverAvailable()).toBe(false);
	});
});
