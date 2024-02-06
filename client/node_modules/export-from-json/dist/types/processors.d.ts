import type { ExportType } from './types.js';
export declare function generateDataURI(content: string, type: ExportType, byBlob: boolean): string;
export declare function downloadFile(content: string, type: ExportType, fileName?: string, byBlob?: boolean): void;
