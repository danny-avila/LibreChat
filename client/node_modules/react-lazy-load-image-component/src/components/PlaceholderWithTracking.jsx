import React from 'react';

import PlaceholderWithoutTracking from './PlaceholderWithoutTracking.jsx';
import trackWindowScroll from '../hoc/trackWindowScroll.js';

class PlaceholderWithTracking extends React.Component {
	constructor(props) {
		super(props);
	}

	render() {
		return <PlaceholderWithoutTracking {...this.props} />;
	}
}

export default trackWindowScroll(PlaceholderWithTracking);
