const express = require('express');
const { ContentTypes } = require('librechat-data-provider');
const { Message } = require('~/models/Message');
const { saveConvo, saveMessage, getMessages, updateMessage, deleteMessages } = require('~/models');
const { findAllArtifacts, replaceArtifactContent } = require('~/server/services/Artifacts/update');
const { requireJwtAuth, validateMessageReq } = require('~/server/middleware');
const { countTokens, decrypt, encrypt } = require('~/server/utils');
const { logger } = require('~/config');

const router = express.Router();
router.use(requireJwtAuth);

const isEncrypted = (text) => {
  if (!text || typeof text !== 'string') {
    return false;
  }
  const parts = text.split(':');
  return parts.length === 2 && parts[0].length === 32;
};

router.post('/encrypt', async (req, res) => {
  logger.info('Encrypting messages');
  try {
    const encryptionKey = req.headers['x-encryption-key'];
    if (!encryptionKey) {
      return res.status(400).json({ error: 'Encryption key required' });
    }

    if (!req.user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Find all messages for this user
    const messages = await Message.find({ user: req.user.id });
    if (!messages) {
      return res.status(404).json({ error: 'No messages found' });
    }

    logger.info(`Found ${messages.length} messages to encrypt for user ${req.user.id}`);

    let successCount = 0;
    let errorCount = 0;

    for (const message of messages) {
      try {
        const messageToEncrypt = { ...message.toObject() };

        // Only encrypt if not already encrypted
        if (messageToEncrypt.text && !isEncrypted(messageToEncrypt.text)) {
          messageToEncrypt.text = encrypt(messageToEncrypt.text, encryptionKey);
        }

        // Encrypt content if it exists and not already encrypted
        if (messageToEncrypt.content) {
          messageToEncrypt.content = messageToEncrypt.content.map((item) => {
            if (item.text && !isEncrypted(item.text)) {
              return { ...item, text: encrypt(item.text, encryptionKey) };
            }
            return item;
          });
        }

        // Save the encrypted message
        await Message.findOneAndUpdate({ _id: message._id }, messageToEncrypt, { new: true });
        successCount++;
      } catch (error) {
        errorCount++;
        logger.error(`Error processing message ${message.messageId}:`, error);
      }
    }

    res.status(200).json({
      success: true,
      stats: {
        total: messages.length,
        success: successCount,
        errors: errorCount,
      },
    });
  } catch (error) {
    logger.error('Error encrypting messages:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

router.post('/decrypt', async (req, res) => {
  logger.info('Decrypting messages');
  try {
    const encryptionKey = req.headers['x-encryption-key'];
    if (!encryptionKey) {
      return res.status(400).json({ error: 'Encryption key required' });
    }

    if (!req.user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Find all messages for this user
    const messages = await Message.find({ user: req.user.id });
    if (!messages) {
      return res.status(404).json({ error: 'No messages found' });
    }

    logger.info(`Found ${messages.length} messages to decrypt for user ${req.user.id}`);

    let successCount = 0;
    let errorCount = 0;

    for (const message of messages) {
      try {
        const decryptedMessage = { ...message.toObject() };

        // Decrypt text if it exists and is encrypted
        if (decryptedMessage.text && isEncrypted(decryptedMessage.text)) {
          decryptedMessage.text = decrypt(decryptedMessage.text, encryptionKey);
        }

        // Decrypt content if it exists
        if (decryptedMessage.content) {
          decryptedMessage.content = decryptedMessage.content.map((item) => {
            if (item.text && isEncrypted(item.text)) {
              return { ...item, text: decrypt(item.text, encryptionKey) };
            }
            return item;
          });
        }

        // Save the decrypted message
        await Message.findOneAndUpdate({ _id: message._id }, decryptedMessage, { new: true });
        successCount++;
      } catch (error) {
        errorCount++;
        logger.error(`Error processing message ${message.messageId}:`, error);
      }
    }

    res.status(200).json({
      success: true,
      stats: {
        total: messages.length,
        success: successCount,
        errors: errorCount,
      },
    });
  } catch (error) {
    logger.error('Error decrypting messages:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

router.post('/artifact/:messageId', async (req, res) => {
  try {
    const { messageId, conversationId } = req.params;
    const { index, original, updated } = req.body;

    if (typeof index !== 'number' || index < 0 || original == null || updated == null) {
      return res.status(400).json({ error: 'Invalid request parameters' });
    }

    const filter = {
      conversationId,
      messageId,
      encryptionKey:
        req.headers['x-encryption-enabled'] === 'true'
          ? req.headers['x-encryption-key']
          : undefined,
    };
    const message = await getMessages(filter, '-_id -__v -user');

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const artifacts = findAllArtifacts(message);
    if (index >= artifacts.length) {
      return res.status(400).json({ error: 'Artifact index out of bounds' });
    }

    const targetArtifact = artifacts[index];
    let updatedText = null;

    if (targetArtifact.source === 'content') {
      const part = message.content[targetArtifact.partIndex];
      updatedText = replaceArtifactContent(part.text, targetArtifact, original, updated);
      if (updatedText) {
        part.text = updatedText;
      }
    } else {
      updatedText = replaceArtifactContent(message.text, targetArtifact, original, updated);
      if (updatedText) {
        message.text = updatedText;
      }
    }

    if (!updatedText) {
      return res.status(400).json({ error: 'Original content not found in target artifact' });
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

    res.status(200).json({
      conversationId: savedMessage.conversationId,
      content: savedMessage.content,
      text: savedMessage.text,
    });
  } catch (error) {
    logger.error('Error editing artifact:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:conversationId', validateMessageReq, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const filter = {
      conversationId,
      encryptionKey:
        req.headers['x-encryption-enabled'] === 'true'
          ? req.headers['x-encryption-key']
          : undefined,
    };
    const messages = await getMessages(filter, '-_id -__v -user');
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
    const filter = {
      conversationId,
      messageId,
      encryptionKey:
        req.headers['x-encryption-enabled'] === 'true'
          ? req.headers['x-encryption-key']
          : undefined,
    };
    const message = await getMessages(filter, '-_id -__v -user');
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

    const filter = {
      conversationId,
      messageId,
      encryptionKey:
        req.headers['x-encryption-enabled'] === 'true'
          ? req.headers['x-encryption-key']
          : undefined,
    };
    const message = (await getMessages(filter, 'content tokenCount'))?.[0];
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
    const filter = {
      messageId,
      user: req.user.id,
      encryptionKey:
        req.headers['x-encryption-enabled'] === 'true'
          ? req.headers['x-encryption-key']
          : undefined,
    };
    await deleteMessages(filter);
    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting message:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;