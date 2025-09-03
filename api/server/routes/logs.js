const express = require('express');
const router = express.Router();
const { requireJwtAuth, checkAdmin } = require('~/server/middleware');
const queryLogger = require('~/server/services/QueryLogger');
const { Message, User } = require('~/db/models');

router.use(requireJwtAuth, checkAdmin);

router.get('/queries', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send historical logs
  try {
    const historicalLogs = await Message.find({ model: { $ne: null } })
      .sort({ createdAt: -1 })
      .lean();
    console.log(`Fetched ${historicalLogs.length} historical logs.`);

    for (const log of historicalLogs.reverse()) {
      try {
        const user = await User.findById(log.user);
        const logData = {
          user: user ? { name: user.name, email: user.email } : { id: log.user },
          model: log.model,
          tokenCount: log.tokenCount,
          createdAt: log.createdAt,
        };
        res.write(`data: ${JSON.stringify(logData)}

`);
      } catch (error) {
        console.error('Error processing historical log document:', error);
      }
    }
  } catch (error) {
    console.error('Error fetching historical logs:', error);
  }

  // Add client for real-time logs
  queryLogger.addClient(res);

  // Set up change stream for real-time logs
  const changeStream = Message.watch([
    {
      $match: {
        operationType: 'insert',
        'fullDocument.model': { $ne: null },
      },
    },
  ]);

  changeStream.on('change', async (change) => {
    if (change.operationType === 'insert') {
      const newMessage = change.fullDocument;
      try {
        const user = await User.findById(newMessage.user);
        const logData = {
          user: user ? { name: user.name, email: user.email } : { id: newMessage.user },
          model: newMessage.model,
          tokenCount: newMessage.tokenCount,
          createdAt: newMessage.createdAt,
        };
        res.write(`data: ${JSON.stringify(logData)}

`);
      } catch (error) {
        console.error('Error processing change stream document:', error);
      }
    }
  });

  req.on('close', () => {
    queryLogger.removeClient(res);
    changeStream.close();
    console.log('Client disconnected, change stream closed.');
  });
});

module.exports = router;