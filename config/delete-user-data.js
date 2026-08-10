async function deleteUserData({
  models,
  uid,
  userObjectId,
  deleteTransactions,
  authorityConsistency,
  invalidateAuthUserDoc,
}) {
  const {
    Key,
    User,
    File,
    Agent,
    Token,
    Group,
    Action,
    Preset,
    Prompt,
    Balance,
    Message,
    Session,
    AclEntry,
    ToolCall,
    Assistant,
    SharedLink,
    PluginAuth,
    MemoryEntry,
    PromptGroup,
    AgentApiKey,
    Transaction,
    Conversation,
    ConversationTag,
  } = models;

  const unrelatedTasks = [
    Action.deleteMany({ user: uid }),
    AgentApiKey.deleteMany({ user: uid }),
    Assistant.deleteMany({ user: uid }),
    Balance.deleteMany({ user: uid }),
    ConversationTag.deleteMany({ user: uid }),
    Conversation.deleteMany({ user: uid }),
    Message.deleteMany({ user: uid }),
    File.deleteMany({ user: uid }),
    Key.deleteMany({ userId: uid }),
    MemoryEntry.deleteMany({ userId: uid }),
    Prompt.deleteMany({ author: uid }),
    PromptGroup.deleteMany({ author: uid }),
    Preset.deleteMany({ user: uid }),
    Session.deleteMany({ user: uid }),
    SharedLink.deleteMany({ user: uid }),
    ToolCall.deleteMany({ user: uid }),
  ];
  if (deleteTransactions) {
    unrelatedTasks.push(Transaction.deleteMany({ user: uid }));
  }
  await Promise.all(unrelatedTasks);

  await authorityConsistency.mutateMCPAuthority(async () => {
    await Promise.all([
      Agent.deleteMany({ author: uid }),
      PluginAuth.deleteMany({ userId: uid }),
      Token.deleteMany({ userId: uid }),
      AclEntry.deleteMany({ principalId: userObjectId }),
      Group.updateMany({ memberIds: uid }, { $pullAll: { memberIds: [uid] } }),
      User.deleteOne({ _id: uid }),
    ]);
  });

  await invalidateAuthUserDoc({ userId: uid });
}

module.exports = { deleteUserData };
