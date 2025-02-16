const { getResponseSender, Constants } = require('librechat-data-provider');
const { createAbortController, handleAbortError } = require('~/server/middleware');
const { sendMessage, createOnProgress } = require('~/server/utils');
const { saveMessage, getUserById } = require('~/models');
const { logger } = require('~/config');

let crypto;
try {
  crypto = require('crypto');
} catch (err) {
  logger.error('[AskController] crypto support is disabled!', err);
}

/**
 * Helper function to encrypt plaintext using AES-256-GCM and then RSA-encrypt the AES key.
 * @param {string} plainText - The plaintext to encrypt.
 * @param {string} pemPublicKey - The RSA public key in PEM format.
 * @returns {Object} An object containing the ciphertext, iv, authTag, and encryptedKey.
 */
function encryptText(plainText, pemPublicKey) {
  // Generate a random 256-bit AES key and a 12-byte IV.
  const aesKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);

  // Encrypt the plaintext using AES-256-GCM.
  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
  let ciphertext = cipher.update(plainText, 'utf8', 'base64');
  ciphertext += cipher.final('base64');
  const authTag = cipher.getAuthTag().toString('base64');

  // Encrypt the AES key using the user's RSA public key.
  const encryptedKey = crypto.publicEncrypt(
    {
      key: pemPublicKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    aesKey,
  ).toString('base64');

  return {
    ciphertext,
    iv: iv.toString('base64'),
    authTag,
    encryptedKey,
  };
}

/**
 * AskController
 * - Initializes the client.
 * - Obtains the response from the language model.
 * - Retrieves the full user record (to get encryption parameters).
 * - If the user has encryption enabled (i.e. encryptionPublicKey is provided),
 *   encrypts both the request (userMessage) and the response before saving.
 */
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
  const userId = req.user.id; // User ID from authentication

  // Retrieve full user record from DB (including encryption parameters)
  const dbUser = await getUserById(userId, 'encryptionPublicKey encryptedPrivateKey encryptionSalt encryptionIV');

  // If the user has provided an encryption public key, rebuild the PEM format.
  let pemPublicKey = null;
  if (dbUser?.encryptionPublicKey && dbUser.encryptionPublicKey.trim() !== '') {
    const pubKeyBase64 = dbUser.encryptionPublicKey;
    pemPublicKey = `-----BEGIN PUBLIC KEY-----\n${pubKeyBase64.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`;
  }

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
      if (!abortController) { return; }
      if (abortController.signal.aborted || abortController.requestCompleted) { return; }
      abortController.abort();
      logger.debug('[AskController] Request aborted on close');
    });

    const messageOptions = {
      user: userId,
      parentMessageId,
      conversationId,
      overrideParentMessageId,
      getReqData,
      onStart,
      abortController,
      progressCallback,
      progressOptions: { res },
    };

    // Get the response from the language model client.
    let response = await client.sendMessage(text, messageOptions);
    response.endpoint = endpointOption.endpoint;

    // Ensure the conversation has a title.
    const { conversation = {} } = await client.responsePromise;
    conversation.title =
      conversation && !conversation.title ? null : conversation?.title || 'New Chat';

    if (client.options.attachments) {
      userMessage.files = client.options.attachments;
      conversation.model = endpointOption.modelOptions.model;
      delete userMessage.image_urls;
    }

    // --- Encrypt the user message if encryption is enabled ---
    if (pemPublicKey && userMessage && userMessage.text) {
      try {
        const { ciphertext, iv, authTag, encryptedKey } = encryptText(userMessage.text, pemPublicKey);
        userMessage.text = ciphertext;
        userMessage.iv = iv;
        userMessage.authTag = authTag;
        userMessage.encryptedKey = encryptedKey;
        logger.debug('[AskController] User message encrypted.');
      } catch (encError) {
        logger.error('[AskController] Error encrypting user message:', encError);
        // Optionally, you could choose to throw an error or fallback.
      }
    }

    // --- Encrypt the AI response if encryption is enabled ---
    if (pemPublicKey && response.text) {
      try {
        const { ciphertext, iv, authTag, encryptedKey } = encryptText(response.text, pemPublicKey);
        response.text = ciphertext;
        response.iv = iv;
        response.authTag = authTag;
        response.encryptedKey = encryptedKey;
        logger.debug('[AskController] Response message encrypted.');
      } catch (encError) {
        logger.error('[AskController] Error encrypting response message:', encError);
        // Optionally, you can choose to send plaintext or handle the error.
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
          { ...response, user: userId },
          { context: 'AskController - response end' },
        );
      }
    }

    if (!client.skipSaveUserMessage) {
      await saveMessage(req, userMessage, {
        context: 'AskController - save user message',
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
      logger.error('[AskController] Error in handleAbortError', err);
    });
  }
};

module.exports = AskController;