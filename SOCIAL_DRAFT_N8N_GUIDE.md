# Social Draft – n8n Multi-Platform & Response Shape

How to generate drafts for LinkedIn, X, Instagram, Facebook in n8n and return them so LibreChat can display them.

---

## 1. Response shape LibreChat expects

So the modal can show drafts per platform, n8n should return:

```json
{
  "success": true,
  "drafts": {
    "linkedin": "Your LinkedIn post text...",
    "x": "Your X/Twitter post text...",
    "instagram": "Your Instagram caption...",
    "facebook": "Your Facebook post text..."
  }
}
```

- **linkedin**, **x**, **instagram**, **facebook** (and optionally **farcaster**) are supported labels in the UI.
- If n8n returns only one platform (e.g. `drafts.linkedin`), the modal will show that. If it returns several, all are shown.

---

## 2. Multi-platform in n8n (two options)

### Option A – One “Message a model” per platform (recommended)

1. **Keep** your current flow: Webhook1 → Prepare Data → **Message a model (LinkedIn)**.
2. **Duplicate** the “Message a model” node (or add new ones) for **X**, **Instagram**, **Facebook**.
3. Connect **Prepare Data** to each of the 4 LLM nodes (same input, different prompts).
4. **Prompts** (adjust tone/length as you like):
   - **LinkedIn:**  
     `Turn this raw idea into a single LinkedIn post (2-4 sentences, professional tone). Raw idea: {{ $json.rawIdea }}`
   - **X (Twitter):**  
     `Turn this raw idea into a single tweet (under 280 characters, punchy). Raw idea: {{ $json.rawIdea }}`
   - **Instagram:**  
     `Turn this raw idea into a short Instagram caption (1-3 sentences, can include a hashtag). Raw idea: {{ $json.rawIdea }}`
   - **Facebook:**  
     `Turn this raw idea into a short Facebook post (2-4 sentences, conversational). Raw idea: {{ $json.rawIdea }}`
5. Add a **Code** node that runs **after all 4** LLM nodes. In n8n you can use a **Merge** node to combine the 4 branches into one item per platform, then a **Code** node to build the `drafts` object from the merged items (e.g. by node name or order: first = linkedin, second = x, etc.), or use a **Code** node that reads from `$('Message a model - LinkedIn').first().json`, `$('Message a model - X').first().json`, etc., and outputs:
   ```js
   const linkedin = $('Message a model - LinkedIn').first().json?.output?.[0]?.content?.[0]?.text ?? '';
   const x = $('Message a model - X').first().json?.output?.[0]?.content?.[0]?.text ?? '';
   // ... same for instagram, facebook
   return [{ json: { success: true, drafts: { linkedin, x, instagram, facebook } } }];
   ```
   (Adjust node names and the path to the text to match your “Message a model” output.)
6. Connect this Code node to **Respond to Webhook1**. In Respond to Webhook, set **Response Body** to:
   `{{ JSON.stringify($json) }}`
   so the body is exactly `{ success: true, drafts: { ... } }`.

### Option B – One “Message a model” with structured output

1. Use a **single** “Message a model” node with a prompt like:
   ```
   Given this raw idea: {{ $json.rawIdea }}
   Return a JSON object with exactly these keys: linkedin, x, instagram, facebook.
   Each value is the post text for that platform (2-4 sentences). No other text, only valid JSON.
   ```
2. Add a **Code** node after it to parse the model’s reply (strip markdown/code blocks if needed) and build:
   `{ success: true, drafts: { linkedin, x, instagram, facebook } }`.
   - **Pass input correctly:** In the Code node you receive the previous node’s item as `$json`. Call `processResponseData($json)` — **not** `processResponseData({$json})`, or `data` will be `{ $json: ... }` and `data.output` will be undefined.
   - **Return format:** n8n Code nodes must return an **array of items** with a `json` property. Return `[{ json: { success: true, drafts } }]` (and in catch `[{ json: { success: false, error: '...' } }]`).
3. Connect that Code node to **Respond to Webhook1** and use **Response Body** `{{ JSON.stringify($json) }}`.

---

## 3. Extracting text from “Message a model” output

Your current node returns something like:

```json
{
  "output": [
    {
      "content": [{ "type": "output_text", "text": "I'm Ikechukwu..." }],
      "role": "assistant"
    }
  ]
}
```

So the draft text is: **`output[0].content[0].text`**.

In a **Code** node that builds the response:

- For one platform:  
  `const linkedin = $input.first().json?.output?.[0]?.content?.[0]?.text ?? '';`
- Then output:  
  `return [{ json: { success: true, drafts: { linkedin } } }];`

**Option B – full function (single LLM returning JSON or plain text):** Pass the **item** as `$json`, not `{$json}`. Return an **array** of items with `json`. This version tries JSON first, then falls back to parsing plain-text labels (Facebook:, Twitter:, LinkedIn:, Instagram:, Pinterest:) so the workflow keeps working if the model ignores the “return only JSON” instruction:

```js
// Map plain-text platform labels to our keys (Twitter → x, Pinterest → farcaster)
function parsePlainTextDrafts(text) {
  const drafts = { linkedin: '', x: '', instagram: '', facebook: '', farcaster: '' };
  const keyMap = { Facebook: 'facebook', Twitter: 'x', LinkedIn: 'linkedin', Instagram: 'instagram', Pinterest: 'farcaster' };
  const blocks = text.split(/(?=(?:Facebook|Twitter|LinkedIn|Instagram|Pinterest):\s*\n)/);
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    const labelMatch = block.match(/^(Facebook|Twitter|LinkedIn|Instagram|Pinterest):\s*\n/);
    if (!labelMatch) continue;
    const platform = labelMatch[1];
    const key = keyMap[platform];
    if (!key) continue;
    const openQuote = block.indexOf('"', labelMatch[0].length);
    if (openQuote === -1) continue;
    const closeMatch = block.indexOf('"\n\n', openQuote + 1);
    const end = closeMatch === -1 ? block.length : closeMatch + 1;
    let content = block.substring(openQuote + 1, end).replace(/"\s*$/, '').trim();
    if (content) drafts[key] = content;
  }
  return drafts;
}

function processResponseData(data) {
  try {
    const content = (data.output && data.output[0] && data.output[0].content && data.output[0].content[0] && data.output[0].content[0].text) ? data.output[0].content[0].text : '';
    if (!content || typeof content !== 'string') {
      return [{ json: { success: false, error: 'No text in model output' } }];
    }
    const raw = content.trim();
    // Strip markdown code fence if present
    const toParse = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim();
    let drafts = { linkedin: '', x: '', instagram: '', facebook: '', farcaster: '' };
    try {
      const parsed = JSON.parse(toParse);
      drafts = {
        linkedin: (parsed.linkedin ?? '').trim(),
        x: (parsed.x ?? '').trim(),
        instagram: (parsed.instagram ?? '').trim(),
        facebook: (parsed.facebook ?? '').trim(),
        farcaster: (parsed.farcaster ?? '').trim(),
      };
    } catch (_) {
      drafts = parsePlainTextDrafts(content);
    }
    const prepareData = $('Prepare Data').first().json;
    const userId = prepareData && prepareData.userId;
    const ideaId = prepareData && prepareData.ideaId;
    const rawIdea = prepareData && prepareData.rawIdea;
    return [{ json: { success: true, drafts, userId, ideaId, rawIdea } }];
  } catch (error) {
    console.error(error);
    return [{ json: { success: false, error: 'Failed to process response data' } }];
  }
}
return processResponseData($json);   // pass $json; Code node must return the array
```

For Option A with 4 nodes, use `$('NodeName').first().json` and the same `output[0].content[0].text` path for each, then combine into one `drafts` object.

---

## 4. Webhook response mode

- **Webhook1** must be set to **Respond:** “Using 'Respond to Webhook' Node”.
- **Respond to Webhook1** must be the last node and receive the single item `{ success: true, drafts: { ... } }`.

---

## 5. Summary

| Step | What to do |
|------|------------|
| 1 | Add “Message a model” nodes for X, Instagram, Facebook (or one node with JSON prompt). |
| 2 | Add a Code (and optional Merge) node to build `{ success: true, drafts: { linkedin, x, instagram, facebook } }` from the LLM output(s). |
| 3 | Connect that node to Respond to Webhook1; Response Body = `{{ JSON.stringify($json) }}`. |
| 4 | Ensure Webhook1 uses “Using Respond to Webhook Node”. |

Once n8n returns that shape, the LibreChat modal will show each platform’s draft with a **Copy** button and **Start another** / **Close**.
