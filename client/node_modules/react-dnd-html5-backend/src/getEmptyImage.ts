let emptyImage: HTMLImageElement | undefined

export function getEmptyImage(): HTMLImageElement {
	if (!emptyImage) {
		emptyImage = new Image()
		emptyImage.src =
			'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='
	}

	return emptyImage
}
