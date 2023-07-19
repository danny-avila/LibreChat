async function abortMessage(req, res, abortControllers) {
  const { abortKey } = req.body;
  console.log('req.body', req.body);
  if (!abortControllers.has(abortKey)) {
    return res.status(404).send('Request not found');
  }

  const { abortController } = abortControllers.get(abortKey);

  abortControllers.delete(abortKey);
  const ret = await abortController.abortAsk();
  console.log('Aborted request', abortKey);
  console.log('Aborted message:', ret);

  res.send(JSON.stringify(ret));
}

module.exports = abortMessage;