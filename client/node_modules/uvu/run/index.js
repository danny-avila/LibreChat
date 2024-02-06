exports.run = async function (suites, opts={}) {
	globalThis.UVU_DEFER = 1;
	const uvu = require('uvu');

	suites.forEach((suite, idx) => {
		globalThis.UVU_QUEUE.push([suite.name]);
		globalThis.UVU_INDEX = idx;
		require(suite.file);
	});

	await uvu.exec(opts.bail);
}
