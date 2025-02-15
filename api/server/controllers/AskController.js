const { getResponseSender, Constants } = require('librechat-data-provider');
const { createAbortController, handleAbortError } = require('~/server/middleware');
const { sendMessage, createOnProgress } = require('~/server/utils');
const { saveMessage } = require('~/models');
const { logger } = require('~/config');

let crypto;
try {
  crypto = require('crypto');
} catch (err) {
  logger.error('[openidStrategy] crypto support is disabled!', err);
}

const AskController = async (req, res, next, initializeClient, addTitle) => {
  let {
    text,
    endpointOption,
    conversationId,
    modelDisplayLabel,
    parentMessageId = null,
    overrideParentMessageId = null,
  } = req.body;

  logger.debug('[AskController]', {
    text,
    conversationId,
    ...endpointOption,
    modelsConfig: endpointOption.modelsConfig ? 'exists' : '',
  });

  let userMessage;
  let userMessagePromise;
  let promptTokens;
  let userMessageId;
  let responseMessageId;
  const sender = getResponseSender({
    ...endpointOption,
    model: endpointOption.modelOptions.model,
    modelDisplayLabel,
  });
  const newConvo = !conversationId;
  const user = req.user.id;

  const getReqData = (data = {}) => {
    for (let key in data) {
      if (key === 'userMessage') {
        userMessage = data[key];
        userMessageId = data[key].messageId;
      } else if (key === 'userMessagePromise') {
        userMessagePromise = data[key];
      } else if (key === 'responseMessageId') {
        responseMessageId = data[key];
      } else if (key === 'promptTokens') {
        promptTokens = data[key];
      } else if (!conversationId && key === 'conversationId') {
        conversationId = data[key];
      }
    }
  };

  let getText;

  try {
    const { client } = await initializeClient({ req, res, endpointOption });
    const { onProgress: progressCallback, getPartialText } = createOnProgress();

    getText = client.getStreamText != null ? client.getStreamText.bind(client) : getPartialText;

    const getAbortData = () => ({
      sender,
      conversationId,
      userMessagePromise,
      messageId: responseMessageId,
      parentMessageId: overrideParentMessageId ?? userMessageId,
      text: getText(),
      userMessage,
      promptTokens,
    });

    const { abortController, onStart } = createAbortController(req, res, getAbortData, getReqData);

    res.on('close', () => {
      logger.debug('[AskController] Request closed');
      if (!abortController) {return;}
      if (abortController.signal.aborted || abortController.requestCompleted) {return;}
      abortController.abort();
      logger.debug('[AskController] Request aborted on close');
    });

    const messageOptions = {
      user,
      parentMessageId,
      conversationId,
      overrideParentMessageId,
      getReqData,
      onStart,
      abortController,
      progressCallback,
      progressOptions: { res },
    };

    /** @type {TMessage} */
    let response = await client.sendMessage(text, messageOptions);
    response.endpoint = endpointOption.endpoint;

    const { conversation = {} } = await client.responsePromise;
    conversation.title =
      conversation && !conversation.title ? null : conversation?.title || 'New Chat';

    if (client.options.attachments) {
      userMessage.files = client.options.attachments;
      conversation.model = endpointOption.modelOptions.model;
      delete userMessage.image_urls;
    }

    // --- Encryption Branch ---
    // Only encrypt if the user has set up encryption (i.e. non-empty encryptionPublicKey)
    if (
      req.user.encryptionPublicKey &&
      req.user.encryptionPublicKey.trim() !== '' &&
      response.text &&
      crypto
    ) {
      try {
        // Reconstruct the user's RSA public key in PEM format.
        const pubKeyBase64 = req.user.encryptionPublicKey;
        const pemPublicKey = `-----BEGIN PUBLIC KEY-----\n${pubKeyBase64.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`;

        // Generate a random 256-bit AES key and a 12-byte IV.
        const aesKey = crypto.randomBytes(32);
        const iv = crypto.randomBytes(12);

        // Encrypt the response text using AES-GCM.
        const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
        let ciphertext = cipher.update(response.text, 'utf8', 'base64');
        ciphertext += cipher.final('base64');
        const authTag = cipher.getAuthTag().toString('base64');

        // Encrypt the AES key using the client's RSA public key.
        let encryptedKey;
        try {
          encryptedKey = crypto.publicEncrypt(
            {
              key: pemPublicKey,
              padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
              oaepHash: 'sha256',
            },
            aesKey,
          ).toString('base64');
        } catch (err) {
          logger.error('Error encrypting AES key:', err);
          throw new Error('Encryption failure');
        }

        // Replace the plaintext response with the encrypted payload.
        response.text = ciphertext;
        response.iv = iv.toString('base64');
        response.authTag = authTag;
        response.encryptedKey = encryptedKey;
        logger.debug('[AskController] Response message encrypted.');
      } catch (encError) {
        logger.error('[AskController] Error during response encryption:', encError);
        // Optionally, you may choose to return plaintext if encryption fails.
      }
    }
    // --- End Encryption Branch ---

    if (!abortController.signal.aborted) {
      sendMessage(res, {
        final: true,
        conversation,
        title: conversation.title,
        requestMessage: userMessage,
        responseMessage: response,
      });
      res.end();

      if (!client.savedMessageIds.has(response.messageId)) {
        await saveMessage(
          req,
          { ...response, user },
          { context: 'api/server/controllers/AskController.js - response end' },
        );
      }
    }

    if (!client.skipSaveUserMessage) {
      await saveMessage(req, userMessage, {
        context: 'api/server/controllers/AskController.js - don\'t skip saving user message',
      });
    }

    if (addTitle && parentMessageId === Constants.NO_PARENT && newConvo) {
      addTitle(req, {
        text,
        response,
        client,
      });
    }
  } catch (error) {
    const partialText = getText && getText();
    handleAbortError(res, req, error, {
      sender,
      partialText,
      conversationId,
      messageId: responseMessageId,
      parentMessageId: overrideParentMessageId ?? userMessageId ?? parentMessageId,
    }).catch((err) => {
      logger.error('[AskController] Error in `handleAbortError`', err);
    });
  }
};

module.exports = AskController;
