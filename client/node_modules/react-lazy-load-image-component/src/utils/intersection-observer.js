export default function() {
	return (
		typeof window !== 'undefined' &&
		'IntersectionObserver' in window &&
		'isIntersecting' in window.IntersectionObserverEntry.prototype
	);
}
