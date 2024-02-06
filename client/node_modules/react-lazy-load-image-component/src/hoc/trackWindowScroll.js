import React from 'react';
import ReactDom from 'react-dom';
import { PropTypes } from 'prop-types';
import debounce from 'lodash.debounce';
import throttle from 'lodash.throttle';
import isIntersectionObserverAvailable from '../utils/intersection-observer';
import getScrollAncestor from '../utils/get-scroll-ancestor';

const getScrollX = () =>
	typeof window === 'undefined' ? 0 : window.scrollX || window.pageXOffset;
const getScrollY = () =>
	typeof window === 'undefined' ? 0 : window.scrollY || window.pageYOffset;

const trackWindowScroll = BaseComponent => {
	class ScrollAwareComponent extends React.Component {
		constructor(props) {
			super(props);

			this.useIntersectionObserver =
				props.useIntersectionObserver &&
				isIntersectionObserverAvailable();
			if (this.useIntersectionObserver) {
				return;
			}

			const onChangeScroll = this.onChangeScroll.bind(this);

			if (props.delayMethod === 'debounce') {
				this.delayedScroll = debounce(onChangeScroll, props.delayTime);
			} else if (props.delayMethod === 'throttle') {
				this.delayedScroll = throttle(onChangeScroll, props.delayTime);
			}

			this.state = {
				scrollPosition: {
					x: getScrollX(),
					y: getScrollY(),
				},
			};

			this.baseComponentRef = React.createRef();
		}

		componentDidMount() {
			this.addListeners();
		}

		componentWillUnmount() {
			this.removeListeners();
		}

		componentDidUpdate() {
			if (typeof window === 'undefined' || this.useIntersectionObserver) {
				return;
			}

			const scrollElement = getScrollAncestor(
				ReactDom.findDOMNode(this.baseComponentRef.current)
			);

			if (scrollElement !== this.scrollElement) {
				this.removeListeners();
				this.addListeners();
			}
		}

		addListeners() {
			if (typeof window === 'undefined' || this.useIntersectionObserver) {
				return;
			}

			this.scrollElement = getScrollAncestor(
				ReactDom.findDOMNode(this.baseComponentRef.current)
			);

			this.scrollElement.addEventListener('scroll', this.delayedScroll, {
				passive: true,
			});
			window.addEventListener('resize', this.delayedScroll, {
				passive: true,
			});

			if (this.scrollElement !== window) {
				window.addEventListener('scroll', this.delayedScroll, {
					passive: true,
				});
			}
		}

		removeListeners() {
			if (typeof window === 'undefined' || this.useIntersectionObserver) {
				return;
			}

			this.scrollElement.removeEventListener(
				'scroll',
				this.delayedScroll
			);
			window.removeEventListener('resize', this.delayedScroll);

			if (this.scrollElement !== window) {
				window.removeEventListener('scroll', this.delayedScroll);
			}
		}

		onChangeScroll() {
			if (this.useIntersectionObserver) {
				return;
			}

			this.setState({
				scrollPosition: {
					x: getScrollX(),
					y: getScrollY(),
				},
			});
		}

		render() {
			const { delayMethod, delayTime, ...props } = this.props;
			const scrollPosition = this.useIntersectionObserver
				? null
				: this.state.scrollPosition;

			return (
				<BaseComponent
					forwardRef={this.baseComponentRef}
					scrollPosition={scrollPosition}
					{...props}
				/>
			);
		}
	}

	ScrollAwareComponent.propTypes = {
		delayMethod: PropTypes.oneOf(['debounce', 'throttle']),
		delayTime: PropTypes.number,
		useIntersectionObserver: PropTypes.bool,
	};

	ScrollAwareComponent.defaultProps = {
		delayMethod: 'throttle',
		delayTime: 300,
		useIntersectionObserver: true,
	};

	return ScrollAwareComponent;
};

export default trackWindowScroll;
