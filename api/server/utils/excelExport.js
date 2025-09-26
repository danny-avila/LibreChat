const { stringify } = require('csv-stringify/sync');
const { logger } = require('~/config');
const moment = require('moment');

/**
 * Converts an array of log objects to CSV format with specific fields
 * @param {Array} logs - Array of log objects
 * @returns {string} - CSV string
 */
const exportLogsToCSV = (logs) => {
  try {
    // Format the data for CSV with the required fields
    const formattedData = logs.map(log => ({
      'Timestamp': moment(log.timestamp).isValid()
  ? moment(log.timestamp).format('Do MMMM YY, h:mm:ss a')
  : moment().format('Do MMMM YY, h:mm:ss a'),

      'Event': log.action || 'N/A',
      'Name': log.userInfo?.name || 'N/A',
      'Email': log.userInfo?.email || log.userInfo?.username || 'N/A',
      'Details': log.details?.message || log.details?.error || JSON.stringify(log.details || {})
    }));

    // Convert to CSV with proper formatting
    const csv = stringify(formattedData, {
      header: true,
      quoted: true,
      quotedEmpty: true,
      quotedString: true,
      columns: ['Timestamp', 'Event', 'Name', 'Email', 'Details']
    });

    return csv;
  } catch (error) {
    logger.error('Error exporting logs to CSV:', error);
    throw new Error('Failed to generate CSV file');
  }
};

/**
 * Converts an array of query log objects to CSV format with specific fields
 * @param {Array} queryLogs - Array of query log objects
 * @returns {string} - CSV string
 */
const exportQueryLogsToCSV = (queryLogs) => {
  try {
    // Format the data for CSV with the required fields
    const formattedData = queryLogs.map(log => ({
      'Name': log.user?.name || 'N/A',
      'Email': log.user?.email || 'N/A',
      'Timestamp': log.createdAt || new Date().toISOString(),
      'Type': log.role === 'assistant' ? 'Response' : 'Query',
      'Model': log.model || 'N/A',
      'Content': log.text || '',
      'Token Count': log.tokenCount || 0,
      'Role': log.role || 'N/A'
    }));

    // Convert to CSV with proper formatting
    const csv = stringify(formattedData, {
      header: true,
      quoted: true,
      quotedEmpty: true,
      quotedString: true,
      columns: [
        'Name',
        'Email',
        'Timestamp',
        'Type',
        'Model',
        'Content',
        'Token Count',
        'Role'
      ]
    });

    return csv;
  } catch (error) {
    logger.error('Error exporting query logs to CSV:', error);
    throw new Error('Failed to generate query logs CSV file');
  }
};

module.exports = {
  exportLogsToCSV,
  exportQueryLogsToCSV
};