/* eslint require-jsdoc: 0 */
/* eslint max-len: 0 */
/* eslint max-statements: 0 */
/* eslint newline-after-var: 0 */
import React from 'react';
import ReactTestUtils from 'react-dom/test-utils';
import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';

import PlaceholderWithoutTracking from './PlaceholderWithoutTracking.jsx';
import isIntersectionObserverAvailable from '../utils/intersection-observer';

jest.mock('../utils/intersection-observer');

configure({ adapter: new Adapter() });

const {
	scryRenderedDOMComponentsWithClass,
	scryRenderedDOMComponentsWithTag,
} = ReactTestUtils;

describe('PlaceholderWithoutTracking', function() {
	function renderPlaceholderWithoutTracking({
		onVisible = () => null,
		placeholder = null,
		scrollPosition = { x: 0, y: 0 },
		style = {},
		className = '',
	} = {}) {
		return mount(
			<PlaceholderWithoutTracking
				className={className}
				onVisible={onVisible}
				placeholder={placeholder}
				scrollPosition={scrollPosition}
				style={style}
			>
				<p>Lorem ipsum</p>
			</PlaceholderWithoutTracking>
		);
	}

	function simulateScroll(component, offsetX = 0, offsetY = 0) {
		const myMock = jest.fn();

		myMock.mockReturnValue({
			bottom: -offsetY,
			height: 0,
			left: -offsetX,
			right: -offsetX,
			top: -offsetY,
			width: 0,
		});

		component.instance().placeholder.getBoundingClientRect = myMock;

		component.setProps({
			scrollPosition: { x: offsetX, y: offsetY },
		});
	}

	function expectParagraphs(wrapper, numberOfParagraphs) {
		const p = scryRenderedDOMComponentsWithTag(wrapper.instance(), 'p');

		expect(p.length).toEqual(numberOfParagraphs);
	}

	function expectPlaceholders(
		wrapper,
		numberOfPlaceholders,
		placeholderTag = 'span'
	) {
		const placeholder = scryRenderedDOMComponentsWithTag(
			wrapper.instance(),
			placeholderTag
		);

		expect(placeholder.length).toEqual(numberOfPlaceholders);
	}

	function expectPlaceholderWrappers(
		wrapper,
		numberOfPlaceholderWrappers,
		className
	) {
		const placeholderWrapper = scryRenderedDOMComponentsWithClass(
			wrapper.instance(),
			className
		);

		expect(placeholderWrapper.length).toEqual(numberOfPlaceholderWrappers);
	}

	const windowIntersectionObserver = window.IntersectionObserver;

	beforeEach(() => {
		isIntersectionObserverAvailable.mockImplementation(() => false);
	});

	afterEach(() => {
		window.IntersectionObserver = windowIntersectionObserver;
	});

	it("renders the default placeholder when it's not in the viewport", function() {
		const className = 'placeholder-wrapper';
		const component = renderPlaceholderWithoutTracking({
			style: { marginTop: 100000 },
			className,
		});

		expectParagraphs(component, 0);
		expectPlaceholders(component, 1);
		expectPlaceholderWrappers(component, 1, className);
	});

	it("renders the prop placeholder when it's not in the viewport", function() {
		const style = { marginTop: 100000 };
		const className = 'placeholder-wrapper';
		const placeholder = <strong style={style}></strong>;
		const component = renderPlaceholderWithoutTracking({
			placeholder,
			style,
			className,
		});

		expectParagraphs(component, 0);
		expectPlaceholders(component, 1, 'strong');
		expectPlaceholderWrappers(component, 0, className);
	});

	it("renders the prop placeholder (React class) when it's not in the viewport", function() {
		const style = { marginTop: 100000 };
		const className = 'placeholder-wrapper';
		class MyComponent extends React.Component {
			render() {
				return <strong style={style}></strong>;
			}
		}
		const placeholder = <MyComponent />;
		const component = renderPlaceholderWithoutTracking({
			placeholder,
			style,
			className,
		});

		expectParagraphs(component, 0);
		expectPlaceholders(component, 1, 'strong');
		expectPlaceholderWrappers(component, 1, className);
	});

	it("doesn't trigger onVisible when the image is not the viewport", function() {
		const onVisible = jest.fn();
		const component = renderPlaceholderWithoutTracking({
			onVisible,
			style: { marginTop: 100000 },
		});

		expect(onVisible).toHaveBeenCalledTimes(0);
	});

	it('triggers onVisible when the image is in the viewport', function() {
		const onVisible = jest.fn();
		const component = renderPlaceholderWithoutTracking({
			onVisible,
		});

		expect(onVisible).toHaveBeenCalledTimes(1);
	});

	it('triggers onVisible when the image appears in the viewport', function() {
		const onVisible = jest.fn();
		const offset = 100000;
		const component = renderPlaceholderWithoutTracking({
			onVisible,
			style: { marginTop: offset },
		});

		simulateScroll(component, 0, offset);

		expect(onVisible).toHaveBeenCalledTimes(1);
	});

	it('triggers onVisible when the image appears in the viewport', function() {
		const onVisible = jest.fn();
		const offset = 100000;
		const component = renderPlaceholderWithoutTracking({
			onVisible,
			style: { marginLeft: offset },
		});

		simulateScroll(component, offset, 0);

		expect(onVisible).toHaveBeenCalledTimes(1);
	});

	it("doesn't track placeholder visibility if IntersectionObserver is available", function() {
		isIntersectionObserverAvailable.mockImplementation(() => true);
		window.IntersectionObserver = jest.fn(function() {
			this.observe = jest.fn(); // eslint-disable-line babel/no-invalid-this
			this.unobserve = jest.fn(); // eslint-disable-line babel/no-invalid-this
		});
		const onVisible = jest.fn();
		const component = renderPlaceholderWithoutTracking({
			onVisible,
			scrollPosition: null,
		});

		expect(onVisible).toHaveBeenCalledTimes(0);
	});

	it('tracks placeholder visibility when IntersectionObserver is available but scrollPosition is set', function() {
		isIntersectionObserverAvailable.mockImplementation(() => true);
		window.IntersectionObserver = jest.fn(function() {
			this.observe = jest.fn(); // eslint-disable-line babel/no-invalid-this
			this.unobserve = jest.fn(); // eslint-disable-line babel/no-invalid-this
		});
		const offset = 100000;
		const onVisible = jest.fn();
		const component = renderPlaceholderWithoutTracking({
			onVisible,
			style: { marginLeft: offset },
		});

		expect(onVisible).toHaveBeenCalledTimes(0);
	});
});
