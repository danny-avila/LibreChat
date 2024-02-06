// Adapted from https://github.com/loktar00/react-lazy-load/blob/master/src/utils/parentScroll.js

const getElementOverflowValues = (element: HTMLElement) : string => {
	const computedStyle = getComputedStyle(element, null);

	return (
		computedStyle.getPropertyValue('overflow') +
		computedStyle.getPropertyValue('overflow-y') +
		computedStyle.getPropertyValue('overflow-x')
	);
};

const getScrollAncestor = (element: Node) : HTMLElement | Window => {
	if (!(element instanceof HTMLElement)) {
		return window;
	}

	let parent : Node = element;

	while (parent) {
		if (!(parent instanceof HTMLElement)) {
			break;
		}

		if (/(scroll|auto)/.test(getElementOverflowValues(parent))) {
			return parent;
		}

		parent = parent.parentNode;
	}

	return window;
};

export default getScrollAncestor;
