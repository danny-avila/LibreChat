export async function run(suites, opts={}) {
	globalThis.UVU_DEFER = 1;
	const uvu = await import('uvu');

	let suite, idx=0;
	for (suite of suites) {
		globalThis.UVU_INDEX = idx++;
		globalThis.UVU_QUEUE.push([suite.name]);
		await import('file:///' + suite.file);
	}

	await uvu.exec(opts.bail);
}
