const mergeSort = require('./mergeSort');

function reduceMessages(hits) {
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

function reduceHits(hits, titles = []) {
  const counts = {};
  const titleMap = {};
  const convos = [...hits, ...titles];

  for (const convo of convos) {
    if (!counts[convo.conversationId]) {
      counts[convo.conversationId] = 1;
    } else {
      counts[convo.conversationId]++;
    }

    if (convo.title) {
      // titleMap[convo.conversationId] = convo._formatted.title;
      titleMap[convo.conversationId] = convo.title;
    }
  }

  const result = [];

  for (const [conversationId, count] of Object.entries(counts)) {
    result.push({
      conversationId,
      count,
      title: titleMap[conversationId] ? titleMap[conversationId] : null
    });
  }

  return mergeSort(result, (a, b) => b.count - a.count);
}

module.exports = { reduceMessages, reduceHits };
