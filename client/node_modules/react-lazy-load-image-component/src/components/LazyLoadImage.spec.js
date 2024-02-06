/* eslint max-len: 0 */
/* eslint max-statements: 0 */
import React from 'react';
import ReactTestUtils from 'react-dom/test-utils';
import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';

import LazyLoadImage from './LazyLoadImage.jsx';
import LazyLoadComponent from './LazyLoadComponent.jsx';

configure({ adapter: new Adapter() });

const {
	findRenderedComponentWithType,
	findRenderedDOMComponentWithClass,
	findRenderedDOMComponentWithTag,
	scryRenderedDOMComponentsWithClass,
	scryRenderedDOMComponentsWithTag,
	Simulate,
} = ReactTestUtils;

describe('LazyLoadImage', function() {
	it('renders a LazyLoadComponent with the correct props', function() {
		const props = {
			beforeLoad: () => null,
			delayMethod: 'debounce',
			delayTime: 600,
			placeholder: null,
			scrollPosition: { x: 0, y: 0 },
			style: {},
			src: 'http://localhost/lorem-ipsum.jpg',
			visibleByDefault: false,
		};
		const lazyLoadImage = mount(
			<LazyLoadImage
				beforeLoad={props.beforeLoad}
				delayMethod={props.delayMethod}
				delayTime={props.delayTime}
				placeholder={props.placeholder}
				scrollPosition={props.scrollPosition}
				src={props.src}
				style={props.style}
				visibleByDefault={props.visibleByDefault}
			/>
		);

		const lazyLoadComponent = findRenderedComponentWithType(
			lazyLoadImage.instance(),
			LazyLoadComponent
		);
		const img = findRenderedDOMComponentWithTag(
			lazyLoadImage.instance(),
			'img'
		);

		expect(lazyLoadComponent.props.beforeLoad).toEqual(props.beforeLoad);
		expect(lazyLoadComponent.props.delayMethod).toEqual(props.delayMethod);
		expect(lazyLoadComponent.props.delayTime).toEqual(props.delayTime);
		expect(lazyLoadComponent.props.placeholder).toEqual(props.placeholder);
		expect(lazyLoadComponent.props.scrollPosition).toEqual(
			props.scrollPosition
		);
		expect(lazyLoadComponent.props.style).toEqual(props.style);
		expect(lazyLoadComponent.props.visibleByDefault).toEqual(
			props.visibleByDefault
		);
		expect(img.src).toEqual(props.src);
	});

	it('updates state and calls onLoad and afterLoad when img triggers onLoad', function() {
		const afterLoad = jest.fn();
		const onLoad = jest.fn();
		const lazyLoadImage = mount(<LazyLoadImage onLoad={onLoad} afterLoad={afterLoad} />);

		const img = findRenderedDOMComponentWithTag(
			lazyLoadImage.instance(),
			'img'
		);

		Simulate.load(img);

		expect(lazyLoadImage.instance().state.loaded);
		expect(afterLoad).toHaveBeenCalledTimes(1);
		expect(onLoad).toHaveBeenCalledTimes(1);
	});

	it('sets loaded class to wrapper when img triggers onLoad', function() {
		const lazyLoadImage = mount(<LazyLoadImage effect="blur" />);

		const img = findRenderedDOMComponentWithTag(
			lazyLoadImage.instance(),
			'img'
		);

		Simulate.load(img);

		const loadedWrapper = scryRenderedDOMComponentsWithClass(
			lazyLoadImage.instance(),
			'lazy-load-image-loaded'
		);

		expect(loadedWrapper.length).toEqual(1);
	});

	it('resets the background-image and background-size when img triggers onLoad', function() {
		const lazyLoadImage = mount(<LazyLoadImage effect="blur" />);

		const img = findRenderedDOMComponentWithTag(
			lazyLoadImage.instance(),
			'img'
		);

		Simulate.load(img);

		const loadedWrapper = findRenderedDOMComponentWithClass(
			lazyLoadImage.instance(),
			'lazy-load-image-loaded'
		);

		expect(
			loadedWrapper.style.getPropertyValue('background-image')
		).toEqual('');
		expect(loadedWrapper.style.getPropertyValue('background-size')).toEqual(
			''
		);
	});

	it('adds the effect class', function() {
		const lazyLoadImage = mount(<LazyLoadImage effect="blur" />);

		const blurSpan = scryRenderedDOMComponentsWithClass(
			lazyLoadImage.instance(),
			'blur'
		);

		expect(blurSpan.length).toEqual(1);
	});

	it("doesn't render placeholder background when not defined", function() {
		const lazyLoadImage = mount(<LazyLoadImage />);

		const span = scryRenderedDOMComponentsWithTag(
			lazyLoadImage.instance(),
			'span'
		);

		expect(span.length).toEqual(0);
	});

	it('renders placeholder background when defined', function() {
		const lazyLoadImage = mount(
			<LazyLoadImage
				placeholderSrc="lorem-ipsum.jpg"
				visibleByDefault={false}
			/>
		);

		const span = scryRenderedDOMComponentsWithTag(
			lazyLoadImage.instance(),
			'span'
		);

		expect(span.length).toEqual(1);
	});

	it("doesn't render placeholder background when visibleByDefault is true", function() {
		const lazyLoadImage = mount(
			<LazyLoadImage
				placeholderSrc="lorem-ipsum.jpg"
				visibleByDefault={true}
			/>
		);

		const span = scryRenderedDOMComponentsWithTag(
			lazyLoadImage.instance(),
			'span'
		);

		expect(span.length).toEqual(0);
	});
});
