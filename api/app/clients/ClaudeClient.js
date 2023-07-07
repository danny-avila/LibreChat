import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

const stream = await anthropic.completions.create({
  prompt: `${Anthropic.HUMAN_PROMPT} Your prompt here ${Anthropic.AI_PROMPT}`,
  model: 'claude-1',
  stream: true,
  max_tokens_to_sample: 300,
});
for await (const completion of stream) {
  console.log(completion.completion);
}