const mergeSort = require('./mergeSort');

function reduceHits(hits) {
  const counts = {};
  
  for (const hit of hits) {
    if (!counts[hit.conversationId]) {
      counts[hit.conversationId] = 1;
    } else {
      counts[hit.conversationId]++;
    }
  }
  
  const result = [];
  
  for (const [conversationId, count] of Object.entries(counts)) {
    result.push({
      conversationId,
      count
    });
  }
  
  return mergeSort(result, (a, b) => b.count - a.count);
}

module.exports = reduceHits;