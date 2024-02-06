export function getDataFromDataTransfer(
	dataTransfer: DataTransfer,
	typesToTry: string[],
	defaultValue: string,
): string {
	const result = typesToTry.reduce(
		(resultSoFar, typeToTry) => resultSoFar || dataTransfer.getData(typeToTry),
		'',
	)

	return result != null ? result : defaultValue
}
