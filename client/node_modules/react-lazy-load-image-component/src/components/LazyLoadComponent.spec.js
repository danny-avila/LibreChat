/* eslint max-len: 0 */
import React from 'react';
import ReactTestUtils from 'react-dom/test-utils';
import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';

import LazyLoadComponent from './LazyLoadComponent.jsx';
import PlaceholderWithTracking from './PlaceholderWithTracking.jsx';
import PlaceholderWithoutTracking from './PlaceholderWithoutTracking.jsx';
import isIntersectionObserverAvailable from '../utils/intersection-observer';

jest.mock('../utils/intersection-observer');

configure({ adapter: new Adapter() });

const {
	scryRenderedComponentsWithType,
	scryRenderedDOMComponentsWithTag,
} = ReactTestUtils;

describe('LazyLoadComponent', function() {
	const windowIntersectionObserver = window.IntersectionObserver;

	beforeEach(() => {
		isIntersectionObserverAvailable.mockImplementation(() => false);
	});

	afterEach(() => {
		window.IntersectionObserver = windowIntersectionObserver;
	});

	it('renders children when visible', function() {
		const lazyLoadComponent = mount(
			<LazyLoadComponent>
				<p>Lorem Ipsum</p>
			</LazyLoadComponent>
		);

		lazyLoadComponent.instance().onVisible();

		const paragraphs = scryRenderedDOMComponentsWithTag(
			lazyLoadComponent.instance(),
			'p'
		);

		expect(paragraphs.length).toEqual(1);
	});

	describe('placeholders', function() {
		it('renders a PlaceholderWithTracking when scrollPosition is undefined', function() {
			const lazyLoadComponent = mount(
				<LazyLoadComponent style={{ marginTop: 100000 }}>
					<p>Lorem Ipsum</p>
				</LazyLoadComponent>
			);

			const placeholderWithTracking = scryRenderedComponentsWithType(
				lazyLoadComponent.instance(),
				PlaceholderWithTracking
			);

			expect(placeholderWithTracking.length).toEqual(1);
		});

		it('renders a PlaceholderWithTracking when when IntersectionObserver is available but useIntersectionObserver is set to false', function() {
			isIntersectionObserverAvailable.mockImplementation(() => true);
			window.IntersectionObserver = jest.fn(function() {
				this.observe = jest.fn(); // eslint-disable-line babel/no-invalid-this
				this.unobserve = jest.fn(); // eslint-disable-line babel/no-invalid-this
			});

			const lazyLoadComponent = mount(
				<LazyLoadComponent
					useIntersectionObserver={false}
					style={{ marginTop: 100000 }}
				>
					<p>Lorem Ipsum</p>
				</LazyLoadComponent>
			);

			const placeholderWithTracking = scryRenderedComponentsWithType(
				lazyLoadComponent.instance(),
				PlaceholderWithTracking
			);
			const placeholderWithoutTracking = scryRenderedComponentsWithType(
				lazyLoadComponent.instance(),
				PlaceholderWithoutTracking
			);

			expect(placeholderWithTracking.length).toEqual(1);
		});

		it('renders a PlaceholderWithoutTracking when scrollPosition is undefined but IntersectionObserver is available', function() {
			isIntersectionObserverAvailable.mockImplementation(() => true);
			window.IntersectionObserver = jest.fn(function() {
				this.observe = jest.fn(); // eslint-disable-line babel/no-invalid-this
				this.unobserve = jest.fn(); // eslint-disable-line babel/no-invalid-this
			});

			const lazyLoadComponent = mount(
				<LazyLoadComponent style={{ marginTop: 100000 }}>
					<p>Lorem Ipsum</p>
				</LazyLoadComponent>
			);

			const placeholderWithTracking = scryRenderedComponentsWithType(
				lazyLoadComponent.instance(),
				PlaceholderWithTracking
			);
			const placeholderWithoutTracking = scryRenderedComponentsWithType(
				lazyLoadComponent.instance(),
				PlaceholderWithoutTracking
			);

			expect(placeholderWithTracking.length).toEqual(0);
			expect(placeholderWithoutTracking.length).toEqual(1);
		});

		it('renders a PlaceholderWithoutTracking when scrollPosition is defined', function() {
			const lazyLoadComponent = mount(
				<LazyLoadComponent
					scrollPosition={{ x: 0, y: 0 }}
					style={{ marginTop: 100000 }}
				>
					<p>Lorem Ipsum</p>
				</LazyLoadComponent>
			);

			const placeholderWithTracking = scryRenderedComponentsWithType(
				lazyLoadComponent.instance(),
				PlaceholderWithTracking
			);
			const placeholderWithoutTracking = scryRenderedComponentsWithType(
				lazyLoadComponent.instance(),
				PlaceholderWithoutTracking
			);

			expect(placeholderWithTracking.length).toEqual(0);
			expect(placeholderWithoutTracking.length).toEqual(1);
		});
	});

	describe('beforeLoad/afterLoad', function() {
		it('triggers beforeLoad when onVisible is triggered', function() {
			const beforeLoad = jest.fn();
			const lazyLoadComponent = mount(
				<LazyLoadComponent
					beforeLoad={beforeLoad}
					style={{ marginTop: 100000 }}
				>
					<p>Lorem Ipsum</p>
				</LazyLoadComponent>
			);

			lazyLoadComponent.instance().onVisible();

			expect(beforeLoad).toHaveBeenCalledTimes(1);
		});

		it('triggers afterLoad when onVisible is triggered', function() {
			const afterLoad = jest.fn();
			const lazyLoadComponent = mount(
				<LazyLoadComponent
					afterLoad={afterLoad}
					style={{ marginTop: 100000 }}
				>
					<p>Lorem Ipsum</p>
				</LazyLoadComponent>
			);

			lazyLoadComponent.instance().onVisible();

			expect(afterLoad).toHaveBeenCalledTimes(1);
		});

		it('triggers beforeLoad and afterLoad when visibleByDefault is true', function() {
			const afterLoad = jest.fn();
			const beforeLoad = jest.fn();
			const lazyLoadComponent = mount(
				<LazyLoadComponent
					afterLoad={afterLoad}
					beforeLoad={beforeLoad}
					style={{ marginTop: 100000 }}
				>
					<p>Lorem Ipsum</p>
				</LazyLoadComponent>
			);

			lazyLoadComponent.instance().onVisible();

			expect(afterLoad).toHaveBeenCalledTimes(1);
			expect(beforeLoad).toHaveBeenCalledTimes(1);
		});
	});
});
