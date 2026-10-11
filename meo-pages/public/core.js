export function requestedSelection(search, connections, modelsResult) {
  const params = new URLSearchParams(search);
  const connection = params.get('connection') ?? '';
  const requestedModel = params.get('model') ?? '';
  const selectedConnection =
    connections.find((item) => item.id === connection) ?? connections[0] ?? null;
  if (!selectedConnection) return { connection: null, model: '', warning: 'no_connection' };
  const models = modelsResult?.models ?? [];
  const supported = modelsResult?.supported === true;
  if (!supported) {
    return {
      connection: selectedConnection,
      model: requestedModel || selectedConnection.defaultModel || '',
      warning: connection && selectedConnection.id !== connection ? 'invalid_connection' : '',
    };
  }
  const found = models.find((item) => item.id === requestedModel);
  const fallback = models.find((item) => item.id === selectedConnection.defaultModel) ?? models[0];
  let warning = '';
  if (connection && selectedConnection.id !== connection) warning = 'invalid_connection';
  else if (requestedModel && !found) warning = 'invalid_model';
  return {
    connection: selectedConnection,
    model: found?.id ?? fallback?.id ?? selectedConnection.defaultModel ?? '',
    warning,
  };
}

export function chatContext(messages) {
  const selected = [];
  let characters = 0;
  for (let index = messages.length - 1; index >= 0 && selected.length < 80; index -= 1) {
    const message = messages[index];
    const cost = message.content.length + 32;
    if (selected.length && characters + cost > 36_000) break;
    selected.unshift({ role: message.role, content: message.content });
    characters += cost;
  }
  return selected;
}

export function safeMarkdown(markdown) {
  const escape = (value) =>
    value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  const inline = (source) => {
    const tokens = [];
    const stash = (html) => `@@MEOTOKEN${tokens.push(html) - 1}@@`;
    let text = escape(source);
    text = text.replace(/`([^`]+)`/g, (_match, value) => stash(`<code>${value}</code>`));
    text = text.replace(/\[([^\]]+)\]\(([^\s)]+)\)/g, (_match, label, rawUrl) => {
      let safeUrl = '';
      try {
        const url = new URL(rawUrl);
        if (url.protocol === 'https:' || url.protocol === 'http:' || url.protocol === 'mailto:')
          safeUrl = url.toString();
      } catch {
        if (rawUrl.startsWith('/') && !rawUrl.startsWith('//')) safeUrl = rawUrl;
      }
      return safeUrl
        ? stash(
            `<a href="${escape(safeUrl)}" target="_blank" rel="noopener noreferrer">${label}</a>`,
          )
        : label;
    });
    text = text
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
    return text.replace(/@@MEOTOKEN(\d+)@@/g, (_match, index) => tokens[Number(index)] ?? '');
  };
  const lines = String(markdown ?? '')
    .replaceAll('\r\n', '\n')
    .split('\n');
  const blocks = [];
  let paragraph = [];
  let code = null;
  let codeLines = [];
  let list = null;
  const flushParagraph = () => {
    if (paragraph.length) blocks.push(`<p>${paragraph.map(inline).join('<br>')}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list)
      blocks.push(
        `<${list.type}>${list.items.map((item) => `<li>${inline(item)}</li>`).join('')}</${list.type}>`,
      );
    list = null;
  };
  for (const line of lines) {
    const fence = line.match(/^\s*```([\w+-]*)\s*$/);
    if (fence) {
      if (code === null) {
        flushParagraph();
        flushList();
        code = fence[1];
        codeLines = [];
      } else {
        blocks.push(
          `<pre><code${code ? ` class="language-${escape(code)}"` : ''}>${escape(codeLines.join('\n'))}</code></pre>`,
        );
        code = null;
        codeLines = [];
      }
      continue;
    }
    if (code !== null) {
      codeLines.push(line);
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      blocks.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    const item = line.match(/^\s*([-*]|\d+\.)\s+(.+)$/);
    if (item) {
      flushParagraph();
      const type = /^\d/.test(item[1]) ? 'ol' : 'ul';
      if (list && list.type !== type) flushList();
      list ??= { type, items: [] };
      list.items.push(item[2]);
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  if (code !== null) blocks.push(`<pre><code>${escape(codeLines.join('\n'))}</code></pre>`);
  flushParagraph();
  flushList();
  return blocks.join('\n');
}

export class SseParser {
  constructor(onEvent) {
    this.onEvent = onEvent;
    this.buffer = '';
    this.decoder = new TextDecoder();
  }

  push(bytes, done = false) {
    this.buffer += this.decoder.decode(bytes ?? new Uint8Array(), { stream: !done });
    let boundary = /\r?\n\r?\n/.exec(this.buffer);
    while (boundary) {
      this.#block(this.buffer.slice(0, boundary.index));
      this.buffer = this.buffer.slice(boundary.index + boundary[0].length);
      boundary = /\r?\n\r?\n/.exec(this.buffer);
    }
    if (done && this.buffer.trim()) this.#block(this.buffer);
  }

  #block(block) {
    let event = 'message';
    const data = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
    }
    if (!data.length) return;
    const payload = data.join('\n');
    let parsed;
    try {
      parsed = payload === '[DONE]' ? payload : JSON.parse(payload);
    } catch {
      this.onEvent('error', { message: 'Stream response could not be read' });
      return;
    }
    this.onEvent(event, parsed);
  }
}
