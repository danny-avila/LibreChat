module.exports = (req, res, next) => {
  let { stopStream } = req.body;
  if (stopStream) {
    console.log('stopStream');
    res.write('event: stop\ndata:\n\n');
    res.end();
    return;
  } else {
    next();
  }
};
