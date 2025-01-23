const dedent = require('dedent');
const express = require('express');
const { ContentTypes } = require('librechat-data-provider');
const {
  saveConvo,
  saveMessage,
  getMessage,
  getMessages,
  updateMessage,
  deleteMessages,
} = require('~/models');
const { requireJwtAuth, validateMessageReq } = require('~/server/middleware');
const { countTokens } = require('~/server/utils');
const { logger } = require('~/config');

const router = express.Router();
router.use(requireJwtAuth);

const replaceArtifact = (text, original, updated) => {
  const dedentedText = dedent(text);
  const dedentedOriginal = dedent(original);
  const index = dedentedText.indexOf(dedentedOriginal);

  if (index === -1) {
    return null;
  }

  return text.substring(0, index) + updated + '\n' + text.substring(index + original.length);
};

router.post('/artifact/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;
    const { original, updated } = req.body;

    if (!original || !updated) {
      return res.status(400).json({ error: 'Original and updated text required' });
    }

    const message = await getMessage({ user: req.user.id, messageId });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    let isUpdated = false;

    // Check content array first if it exists and has length
    if (message.content?.length) {
      for (const part of message.content) {
        if (part.type === 'text' && typeof part.text === 'string') {
          const replacedText = replaceArtifact(part.text, original, updated);
          if (replacedText !== null) {
            part.text = replacedText;
            isUpdated = true;
          }
        }
      }
    } else if (message.text) {
      const replacedText = replaceArtifact(message.text, original, updated);
      if (replacedText === null) {
        return res.status(400).json({ error: 'Original text not found in message' });
      }
      message.text = replacedText;
      isUpdated = true;
    }

    if (!isUpdated) {
      return res.status(400).json({ error: 'No text content found to update' });
    }

    const savedMessage = await saveMessage(
      req,
      {
        messageId,
        conversationId: message.conversationId,
        text: message.text,
        content: message.content,
        user: req.user.id,
      },
      { context: 'POST /api/messages/artifact/:messageId' },
    );

    if (!savedMessage) {
      return res.status(400).json({ error: 'Message not saved' });
    }

    res.status(200).json({
      conversationId: savedMessage.conversationId,
      content: savedMessage.content,
      text: savedMessage.text,
    });
  } catch (error) {
    logger.error('Error editing message:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/* Note: It's necessary to add `validateMessageReq` within route definition for correct params */
router.get('/:conversationId', validateMessageReq, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const messages = await getMessages({ conversationId }, '-_id -__v -user');
    res.status(200).json(messages);
  } catch (error) {
    logger.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:conversationId', validateMessageReq, async (req, res) => {
  try {
    const message = req.body;
    const savedMessage = await saveMessage(
      req,
      { ...message, user: req.user.id },
      { context: 'POST /api/messages/:conversationId' },
    );
    if (!savedMessage) {
      return res.status(400).json({ error: 'Message not saved' });
    }
    await saveConvo(req, savedMessage, { context: 'POST /api/messages/:conversationId' });
    res.status(201).json(savedMessage);
  } catch (error) {
    logger.error('Error saving message:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:conversationId/:messageId', validateMessageReq, async (req, res) => {
  try {
    const { conversationId, messageId } = req.params;
    const message = await getMessages({ conversationId, messageId }, '-_id -__v -user');
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    res.status(200).json(message);
  } catch (error) {
    logger.error('Error fetching message:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:conversationId/:messageId', validateMessageReq, async (req, res) => {
  try {
    const { conversationId, messageId } = req.params;
    const { text, index, model } = req.body;

    if (index === undefined) {
      const tokenCount = await countTokens(text, model);
      const result = await updateMessage(req, { messageId, text, tokenCount });
      return res.status(200).json(result);
    }

    if (typeof index !== 'number' || index < 0) {
      return res.status(400).json({ error: 'Invalid index' });
    }

    const message = (await getMessages({ conversationId, messageId }, 'content tokenCount'))?.[0];
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const existingContent = message.content;
    if (!Array.isArray(existingContent) || index >= existingContent.length) {
      return res.status(400).json({ error: 'Invalid index' });
    }

    const updatedContent = [...existingContent];
    if (!updatedContent[index]) {
      return res.status(400).json({ error: 'Content part not found' });
    }

    if (updatedContent[index].type !== ContentTypes.TEXT) {
      return res.status(400).json({ error: 'Cannot update non-text content' });
    }

    const oldText = updatedContent[index].text;
    updatedContent[index] = { type: ContentTypes.TEXT, text };

    let tokenCount = message.tokenCount;
    if (tokenCount !== undefined) {
      const oldTokenCount = await countTokens(oldText, model);
      const newTokenCount = await countTokens(text, model);
      tokenCount = Math.max(0, tokenCount - oldTokenCount) + newTokenCount;
    }

    const result = await updateMessage(req, { messageId, content: updatedContent, tokenCount });
    return res.status(200).json(result);
  } catch (error) {
    logger.error('Error updating message:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:conversationId/:messageId', validateMessageReq, async (req, res) => {
  try {
    const { messageId } = req.params;
    await deleteMessages({ messageId });
    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting message:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
