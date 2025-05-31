const {
  ARTIFACT_START,
  ARTIFACT_END,
  findAllArtifacts,
  replaceArtifactContent,
} = require('./update');

const createArtifactText = (options = {}) => {
  const { content = '', wrapCode = true, isClosed = true, prefix = '', suffix = '' } = options;

  const codeBlock = wrapCode ? '```\n' + content + '\n```' : content;
  const end = isClosed ? `\n${ARTIFACT_END}` : '';

  return `${ARTIFACT_START}${prefix}\n${codeBlock}${end}${suffix}`;
};

describe('findAllArtifacts', () => {
  test('should return empty array for message with no artifacts', () => {
    const message = {
      content: [
        {
          type: 'text',
          text: 'No artifacts here',
        },
      ],
    };
    expect(findAllArtifacts(message)).toEqual([]);
  });

  test('should find artifacts in content parts', () => {
    const message = {
      content: [
        { type: 'text', text: createArtifactText({ content: 'content1' }) },
        { type: 'text', text: createArtifactText({ content: 'content2' }) },
      ],
    };

    const result = findAllArtifacts(message);
    expect(result).toHaveLength(2);
    expect(result[0].source).toBe('content');
    expect(result[1].partIndex).toBe(1);
  });

  test('should find artifacts in message.text when content is empty', () => {
    const artifact1 = createArtifactText({ content: 'text1' });
    const artifact2 = createArtifactText({ content: 'text2' });
    const message = { text: [artifact1, artifact2].join('\n') };

    const result = findAllArtifacts(message);
    expect(result).toHaveLength(2);
    expect(result[0].source).toBe('text');
  });

  test('should handle unclosed artifacts', () => {
    const message = {
      text: createArtifactText({ content: 'unclosed', isClosed: false }),
    };
    const result = findAllArtifacts(message);
    expect(result[0].end).toBe(message.text.length);
  });

  test('should handle multiple artifacts in single part', () => {
    const artifact1 = createArtifactText({ content: 'first' });
    const artifact2 = createArtifactText({ content: 'second' });
    const message = {
      content: [
        {
          type: 'text',
          text: [artifact1, artifact2].join('\n'),
        },
      ],
    };

    const result = findAllArtifacts(message);
    expect(result).toHaveLength(2);
    expect(result[1].start).toBeGreaterThan(result[0].end);
  });
});

describe('replaceArtifactContent', () => {
  const createTestArtifact = (content, options) => {
    const text = createArtifactText({ content, ...options });
    return {
      start: 0,
      end: text.length,
      text,
      source: 'text',
    };
  };

  test('should replace content within artifact boundaries', () => {
    const original = "console.log('hello')";
    const artifact = createTestArtifact(original);
    const updated = "console.log('updated')";

    const result = replaceArtifactContent(artifact.text, artifact, original, updated);
    expect(result).toContain(updated);
    expect(result).toMatch(ARTIFACT_START);
    expect(result).toMatch(ARTIFACT_END);
  });

  test('should return null when original not found', () => {
    const artifact = createTestArtifact('function test() {}');
    const result = replaceArtifactContent(artifact.text, artifact, 'missing', 'updated');
    expect(result).toBeNull();
  });

  test('should handle dedented content', () => {
    const original = 'function test() {';
    const artifact = createTestArtifact(original);
    const updated = 'function updated() {';

    const result = replaceArtifactContent(artifact.text, artifact, original, updated);
    expect(result).toContain(updated);
  });

  test('should preserve text outside artifact', () => {
    const artifactContent = createArtifactText({ content: 'original' });
    const fullText = `prefix\n${artifactContent}\nsuffix`;
    const artifact = createTestArtifact('original', {
      prefix: 'prefix\n',
      suffix: '\nsuffix',
    });

    const result = replaceArtifactContent(fullText, artifact, 'original', 'updated');
    expect(result).toMatch(/^prefix/);
    expect(result).toMatch(/suffix$/);
  });

  test('should handle replacement at artifact boundaries', () => {
    const original = 'console.log("hello")';
    const updated = 'console.log("updated")';

    const artifactText = `${ARTIFACT_START}\n${original}\n${ARTIFACT_END}`;
    const artifact = {
      start: 0,
      end: artifactText.length,
      text: artifactText,
      source: 'text',
    };

    const result = replaceArtifactContent(artifactText, artifact, original, updated);

    expect(result).toBe(`${ARTIFACT_START}\n${updated}\n${ARTIFACT_END}`);
  });
});

describe('replaceArtifactContent with shared text', () => {
  test('should replace correct artifact when text is shared', () => {
    const artifactContent = '    hi    '; // Preserve exact spacing
    const sharedText = `LOREM IPSUM

:::artifact{identifier="calculator" type="application/vnd.react" title="Calculator"}
\`\`\`
${artifactContent}
\`\`\`
:::

LOREM IPSUM

:::artifact{identifier="calculator2" type="application/vnd.react" title="Calculator"}
\`\`\`
${artifactContent}
\`\`\`
:::`;

    const message = { text: sharedText };
    const artifacts = findAllArtifacts(message);
    expect(artifacts).toHaveLength(2);

    const targetArtifact = artifacts[1];
    const updatedContent = '    updated content    ';
    const result = replaceArtifactContent(
      sharedText,
      targetArtifact,
      artifactContent,
      updatedContent,
    );

    // Verify exact matches with preserved formatting
    expect(result).toContain(artifactContent); // First artifact unchanged
    expect(result).toContain(updatedContent); // Second artifact updated
    expect(result.indexOf(updatedContent)).toBeGreaterThan(result.indexOf(artifactContent));
  });

  const codeExample = `
function greetPerson(name) {
  return \`Hello, \${name}! Welcome to JavaScript programming.\`;
}

const personName = "Alice";
const greeting = greetPerson(personName);
console.log(greeting);`;

  test('should handle random number of artifacts in content array', () => {
    const numArtifacts = 5; // Fixed number for predictability
    const targetIndex = 2; // Fixed target for predictability

    // Create content array with multiple parts
    const contentParts = Array.from({ length: numArtifacts }, (_, i) => ({
      type: 'text',
      text: createArtifactText({
        content: `content-${i}`,
        wrapCode: true,
        prefix: i > 0 ? '\n' : '',
      }),
    }));

    const message = { content: contentParts };
    const artifacts = findAllArtifacts(message);
    expect(artifacts).toHaveLength(numArtifacts);

    const targetArtifact = artifacts[targetIndex];
    const originalContent = `content-${targetIndex}`;
    const updatedContent = 'updated-content';

    const result = replaceArtifactContent(
      contentParts[targetIndex].text,
      targetArtifact,
      originalContent,
      updatedContent,
    );

    // Verify the specific content was updated
    expect(result).toContain(updatedContent);
    expect(result).not.toContain(originalContent);
    expect(result).toMatch(
      new RegExp(`${ARTIFACT_START}.*${updatedContent}.*${ARTIFACT_END}`, 's'),
    );
  });

  test('should handle artifacts with identical content but different metadata in content array', () => {
    const contentParts = [
      {
        type: 'text',
        text: createArtifactText({
          wrapCode: true,
          content: codeExample,
          prefix: '{id="1", title="First"}',
        }),
      },
      {
        type: 'text',
        text: createArtifactText({
          wrapCode: true,
          content: codeExample,
          prefix: '{id="2", title="Second"}',
        }),
      },
    ];

    const message = { content: contentParts };
    const artifacts = findAllArtifacts(message);

    // Target second artifact
    const targetArtifact = artifacts[1];
    const result = replaceArtifactContent(
      contentParts[1].text,
      targetArtifact,
      codeExample,
      'updated content',
    );
    expect(result).toMatch(/id="2".*updated content/s);
    expect(result).toMatch(new RegExp(`${ARTIFACT_START}.*updated content.*${ARTIFACT_END}`, 's'));
  });

  test('should handle empty content in artifact without code blocks', () => {
    const artifactText = `${ARTIFACT_START}\n\n${ARTIFACT_END}`;
    const artifact = {
      start: 0,
      end: artifactText.length,
      text: artifactText,
      source: 'text',
    };

    const result = replaceArtifactContent(artifactText, artifact, '', 'new content');
    expect(result).toBe(`${ARTIFACT_START}\nnew content\n${ARTIFACT_END}`);
  });

  test('should handle empty content in artifact with code blocks', () => {
    const artifactText = createArtifactText({ content: '' });
    const artifact = {
      start: 0,
      end: artifactText.length,
      text: artifactText,
      source: 'text',
    };

    const result = replaceArtifactContent(artifactText, artifact, '', 'new content');
    expect(result).toMatch(/```\nnew content\n```/);
  });

  test('should handle content with trailing newline in code blocks', () => {
    const contentWithNewline = 'console.log("test")\n';
    const message = {
      text: `Some prefix text\n${createArtifactText({
        content: contentWithNewline,
      })}\nSome suffix text`,
    };

    const artifacts = findAllArtifacts(message);
    expect(artifacts).toHaveLength(1);

    const result = replaceArtifactContent(
      message.text,
      artifacts[0],
      contentWithNewline,
      'updated content',
    );

    // Should update the content and preserve artifact structure
    expect(result).toContain('```\nupdated content\n```');
    // Should preserve surrounding text
    expect(result).toMatch(/^Some prefix text\n/);
    expect(result).toMatch(/\nSome suffix text$/);
    // Should not have extra newlines
    expect(result).not.toContain('\n\n```');
    expect(result).not.toContain('```\n\n');
  });
});
