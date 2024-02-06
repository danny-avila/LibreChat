import React from 'react';
import { PropTypes } from 'prop-types';

import PlaceholderWithoutTracking from './PlaceholderWithoutTracking.jsx';
import PlaceholderWithTracking from './PlaceholderWithTracking.jsx';
import isIntersectionObserverAvailable from '../utils/intersection-observer';

class LazyLoadComponent extends React.Component {
	constructor(props) {
		super(props);

		const {
			afterLoad,
			beforeLoad,
			scrollPosition,
			visibleByDefault,
		} = props;

		this.state = {
			visible: visibleByDefault,
		};

		if (visibleByDefault) {
			beforeLoad();
			afterLoad();
		}

		this.onVisible = this.onVisible.bind(this);

		this.isScrollTracked = Boolean(
			scrollPosition &&
				Number.isFinite(scrollPosition.x) &&
				scrollPosition.x >= 0 &&
				Number.isFinite(scrollPosition.y) &&
				scrollPosition.y >= 0
		);
	}

	componentDidUpdate(prevProps, prevState) {
		if (prevState.visible !== this.state.visible) {
			this.props.afterLoad();
		}
	}

	onVisible() {
		this.props.beforeLoad();
		this.setState({
			visible: true,
		});
	}

	render() {
		if (this.state.visible) {
			return this.props.children;
		}

		const {
			className,
			delayMethod,
			delayTime,
			height,
			placeholder,
			scrollPosition,
			style,
			threshold,
			useIntersectionObserver,
			width,
		} = this.props;

		if (
			this.isScrollTracked ||
			(useIntersectionObserver && isIntersectionObserverAvailable())
		) {
			return (
				<PlaceholderWithoutTracking
					className={className}
					height={height}
					onVisible={this.onVisible}
					placeholder={placeholder}
					scrollPosition={scrollPosition}
					style={style}
					threshold={threshold}
					useIntersectionObserver={useIntersectionObserver}
					width={width}
				/>
			);
		}

		return (
			<PlaceholderWithTracking
				className={className}
				delayMethod={delayMethod}
				delayTime={delayTime}
				height={height}
				onVisible={this.onVisible}
				placeholder={placeholder}
				style={style}
				threshold={threshold}
				width={width}
			/>
		);
	}
}

LazyLoadComponent.propTypes = {
	afterLoad: PropTypes.func,
	beforeLoad: PropTypes.func,
	useIntersectionObserver: PropTypes.bool,
	visibleByDefault: PropTypes.bool,
};

LazyLoadComponent.defaultProps = {
	afterLoad: () => ({}),
	beforeLoad: () => ({}),
	useIntersectionObserver: true,
	visibleByDefault: false,
};

export default LazyLoadComponent;
