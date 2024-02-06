export type ExportType = 'txt' | 'json' | 'csv' | 'xls' | 'xml' | 'css' | 'html'

export const exportTypes: { [ET in ExportType]: ET } = {
    txt : 'txt',
    css : 'css',
    html : 'html',
    json : 'json',
    csv : 'csv',
    xls : 'xls',
    xml : 'xml',
}
