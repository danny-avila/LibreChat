const scenarios = new Map();
module.exports = (run, context) => {
  const user = [...(context.messages ?? [])]
    .reverse()
    .find((message) => message.getType() === 'human');
  const text =
    typeof user?.content === 'string' ? user.content : JSON.stringify(user?.content ?? '');
  const initial = /REVIEW_CASE:(\w+)/.exec(text)?.[1];
  const scenario =
    initial ?? (scenarios.get(context.conversationId) === 'ask' ? 'resumed' : undefined);
  if (initial) scenarios.set(context.conversationId, initial);
  if (!scenario) {
    run.Graph.overrideTestModel([text.replace(/^Reply with exactly: /, '')], 5);
    return;
  }
  const calls = [
    {
      id: `call_review_${scenario}_${user?.id ?? 'resume'}`,
      name: 'bash_tool',
      args: { command: `printf review-${scenario}` },
      type: 'tool_call',
    },
  ];
  run.Graph.overrideTestModel(['Reviewing action.', 'Tool processing complete.'], 5, calls);
};
