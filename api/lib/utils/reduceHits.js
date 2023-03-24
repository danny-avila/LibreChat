const mergeSort = require('./mergeSort');
const { cleanUpPrimaryKeyValue } = require('./misc');

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
    const currentId = cleanUpPrimaryKeyValue(convo.conversationId);
    if (!counts[currentId]) {
      counts[currentId] = 1;
    } else {
      counts[currentId]++;
    }

    if (convo.title) {
      // titleMap[currentId] = convo._formatted.title;
      titleMap[currentId] = convo.title;
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
