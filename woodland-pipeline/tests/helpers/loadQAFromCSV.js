const fs = require('fs');
const path = require('path');
const csvParse = require('csv-parse/sync');

/**
 * Loads QA test cases from a CSV file and returns them as an array of objects
 * CSV columns: id,question,expected_keywords,category
 * expected_keywords should be a semicolon or comma separated string
 */
function loadQAFromCSV(csvPath) {
  const csvContent = fs.readFileSync(csvPath, 'utf8');
  const records = csvParse.parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
  });
  return records.map(row => ({
    id: row.id,
    question: row.question,
    expected_keywords: row.expected_keywords
      ? row.expected_keywords.split(/[;,]/).map(k => k.trim()).filter(Boolean)
      : [],
    category: row.category || '',
  }));
}

module.exports = { loadQAFromCSV };