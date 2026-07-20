const { logger } = require('@librechat/data-schemas');
const { getConvoFiles, getConvo } = require('~/models/Conversation');
const { processDeleteRequest } = require('./process');
const { getMessages } = require('~/models/Message');
const { Conversation } = require('~/db/models');
const { getFiles } = require('~/models/File');

/**
 * BKL: 대화(conversationId)에 첨부·임포트된 파일 중, 같은 사용자의 다른 대화에서
 * 참조되지 않는 파일만 골라 삭제한다. (기존파일 임포트로 여러 채팅에서 공유될 수 있으므로
 * 다른 대화가 참조 중인 파일은 보존한다.)
 *
 * 대화 삭제/아카이브 라우트에서 메시지가 삭제되기 **전에** 호출해야 한다.
 *
 * @param {object} params
 * @param {ServerRequest} params.req - 인증된 요청 (req.user.id 필요)
 * @param {string} params.conversationId
 * @returns {Promise<{ deleted: number, kept: number }>}
 */
async function deleteConvoFiles({ req, conversationId }) {
  const userId = req.user.id;
  const result = { deleted: 0, kept: 0 };

  const convo = await getConvo(userId, conversationId);
  if (!convo) {
    return result;
  }

  /** 1. 이 대화가 참조하는 파일 ID 수집 (메시지 첨부 + Conversation.files) */
  const candidateIds = new Set();
  const messages = (await getMessages({ conversationId }, 'files')) ?? [];
  for (const message of messages) {
    for (const file of message.files ?? []) {
      if (file?.file_id) {
        candidateIds.add(file.file_id);
      }
    }
  }
  for (const fileId of (await getConvoFiles(conversationId)) ?? []) {
    if (fileId) {
      candidateIds.add(fileId);
    }
  }

  if (candidateIds.size === 0) {
    return result;
  }
  const ids = [...candidateIds];

  /** 2. 다른 대화에서 참조 중인 파일 제외 */
  const referencedElsewhere = new Set();
  const otherMessages =
    (await getMessages(
      { user: userId, conversationId: { $ne: conversationId }, 'files.file_id': { $in: ids } },
      'files',
    )) ?? [];
  for (const message of otherMessages) {
    for (const file of message.files ?? []) {
      if (file?.file_id && candidateIds.has(file.file_id)) {
        referencedElsewhere.add(file.file_id);
      }
    }
  }
  const otherConvos =
    (await Conversation.find(
      { user: userId, conversationId: { $ne: conversationId }, files: { $in: ids } },
      'files',
    ).lean()) ?? [];
  for (const otherConvo of otherConvos) {
    for (const fileId of otherConvo.files ?? []) {
      if (candidateIds.has(fileId)) {
        referencedElsewhere.add(fileId);
      }
    }
  }

  const deletableIds = ids.filter((id) => !referencedElsewhere.has(id));
  result.kept = ids.length - deletableIds.length;
  if (deletableIds.length === 0) {
    return result;
  }

  /** 3. 본인 소유 파일만 삭제 */
  const files = (await getFiles({ file_id: { $in: deletableIds }, user: userId })) ?? [];
  if (files.length === 0) {
    return result;
  }

  await processDeleteRequest({ req, files });
  result.deleted = files.length;
  result.kept = ids.length - files.length;
  logger.info(
    `[deleteConvoFiles] user=${userId} convo=${conversationId} deleted=${result.deleted} kept=${result.kept}`,
  );
  return result;
}

module.exports = { deleteConvoFiles };
