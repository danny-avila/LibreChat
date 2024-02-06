import * as NativeTypes from '../NativeTypes.js'
import { getDataFromDataTransfer } from './getDataFromDataTransfer.js'

export interface NativeItemConfigExposePropreties {
	[property: string]: (
		dataTransfer: DataTransfer,
		matchesTypes: string[],
	) => any
}

export interface NativeItemConfig {
	exposeProperties: NativeItemConfigExposePropreties
	matchesTypes: string[]
}

export const nativeTypesConfig: {
	[key: string]: NativeItemConfig
} = {
	[NativeTypes.FILE]: {
		exposeProperties: {
			files: (dataTransfer: DataTransfer): File[] =>
				Array.prototype.slice.call(dataTransfer.files),
			items: (dataTransfer: DataTransfer): DataTransferItemList =>
				dataTransfer.items,
			dataTransfer: (dataTransfer: DataTransfer): DataTransfer => dataTransfer,
		},
		matchesTypes: ['Files'],
	},
	[NativeTypes.HTML]: {
		exposeProperties: {
			html: (dataTransfer: DataTransfer, matchesTypes: string[]): string =>
				getDataFromDataTransfer(dataTransfer, matchesTypes, ''),
			dataTransfer: (dataTransfer: DataTransfer): DataTransfer => dataTransfer,
		},
		matchesTypes: ['Html', 'text/html'],
	},
	[NativeTypes.URL]: {
		exposeProperties: {
			urls: (dataTransfer: DataTransfer, matchesTypes: string[]): string[] =>
				getDataFromDataTransfer(dataTransfer, matchesTypes, '').split('\n'),
			dataTransfer: (dataTransfer: DataTransfer): DataTransfer => dataTransfer,
		},
		matchesTypes: ['Url', 'text/uri-list'],
	},
	[NativeTypes.TEXT]: {
		exposeProperties: {
			text: (dataTransfer: DataTransfer, matchesTypes: string[]): string =>
				getDataFromDataTransfer(dataTransfer, matchesTypes, ''),
			dataTransfer: (dataTransfer: DataTransfer): DataTransfer => dataTransfer,
		},
		matchesTypes: ['Text', 'text/plain'],
	},
}
