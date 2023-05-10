const mergeSort = require('./mergeSort');
const { cleanUpPrimaryKeyValue } = require('./misc');

function reduceMessages(hits) {
  const conversationCounts = {};

  for (const hit of hits) {
    const conversationId = hit.conversationId;
    if (Object.hasOwnProperty.call(conversationCounts, conversationId)) {
      conversationCounts[conversationId]++;
    } else {
      conversationCounts[conversationId] = 1;
    }
  }

  const result = [];

  for (const [conversationId, count] of Object.entries(conversationCounts)) {
    result.push({
      conversationId,
      count
    });
  }

  return mergeSort(result, (a, b) => b.count - a.count);
}

function reduceHits(hits, titles = []) {
  const conversationCounts = {};
  const titleMap = {};
  const convos = [...hits, ...titles];

  for (const convo of convos) {
    const currentId = cleanUpPrimaryKeyValue(convo.conversationId);
    if (Object.hasOwnProperty.call(conversationCounts, currentId)) {
      conversationCounts[currentId]++;
    } else {
      conversationCounts[currentId] = 1;
    }

    if (convo.title) {
      titleMap[currentId] = convo.title;
    }
  }

  const result = [];

  for (const [conversationId, count] of Object.entries(conversationCounts)) {
    result.push({
      conversationId,
      count,
      title: titleMap[conversationId] ?? null
    });
  }

  return mergeSort(result, (a, b) => b.count - a.count);
}

module.exports = { reduceMessages, reduceHits };
