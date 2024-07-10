let ragK = parseInt(process.env.RAG_K || '4', 10); // Initial value

function getRagK() {
  return ragK;
}

function setRagK(newRagK) {
  ragK = newRagK;
}

module.exports = { getRagK, setRagK };
