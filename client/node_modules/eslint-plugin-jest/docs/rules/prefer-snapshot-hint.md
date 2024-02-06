# Prefer including a hint with external snapshots (`prefer-snapshot-hint`)

<!-- end auto-generated rule header -->

When working with external snapshot matchers it's considered best practice to
provide a hint (as the last argument to the matcher) describing the expected
snapshot content that will be included in the snapshots name by Jest.

This makes it easier for reviewers to verify the snapshots during review, and
for anyone to know whether an outdated snapshot is the correct behavior before
updating.

## Rule details

This rule looks for any use of an external snapshot matcher (e.g.
`toMatchSnapshot` and `toThrowErrorMatchingSnapshot`) and checks if they include
a snapshot hint.

## Options

### `'always'`

Require a hint to _always_ be provided when using external snapshot matchers.

Examples of **incorrect** code for the `'always'` option:

```js
const snapshotOutput = ({ stdout, stderr }) => {
  expect(stdout).toMatchSnapshot();
  expect(stderr).toMatchSnapshot();
};

describe('cli', () => {
  describe('--version flag', () => {
    it('prints the version', async () => {
      snapshotOutput(await runCli(['--version']));
    });
  });

  describe('--config flag', () => {
    it('reads the config', async () => {
      const { stdout, parsedConfig } = await runCli([
        '--config',
        'jest.config.js',
      ]);

      expect(stdout).toMatchSnapshot();
      expect(parsedConfig).toMatchSnapshot();
    });

    it('prints nothing to stderr', async () => {
      const { stderr } = await runCli(['--config', 'jest.config.js']);

      expect(stderr).toMatchSnapshot();
    });

    describe('when the file does not exist', () => {
      it('throws an error', async () => {
        await expect(
          runCli(['--config', 'does-not-exist.js']),
        ).rejects.toThrowErrorMatchingSnapshot();
      });
    });
  });
});
```

Examples of **correct** code for the `'always'` option:

```js
const snapshotOutput = ({ stdout, stderr }, hints) => {
  expect(stdout).toMatchSnapshot({}, `stdout: ${hints.stdout}`);
  expect(stderr).toMatchSnapshot({}, `stderr: ${hints.stderr}`);
};

describe('cli', () => {
  describe('--version flag', () => {
    it('prints the version', async () => {
      snapshotOutput(await runCli(['--version']), {
        stdout: 'version string',
        stderr: 'empty',
      });
    });
  });

  describe('--config flag', () => {
    it('reads the config', async () => {
      const { stdout } = await runCli(['--config', 'jest.config.js']);

      expect(stdout).toMatchSnapshot({}, 'stdout: config settings');
    });

    it('prints nothing to stderr', async () => {
      const { stderr } = await runCli(['--config', 'jest.config.js']);

      expect(stderr).toMatchInlineSnapshot();
    });

    describe('when the file does not exist', () => {
      it('throws an error', async () => {
        await expect(
          runCli(['--config', 'does-not-exist.js']),
        ).rejects.toThrowErrorMatchingSnapshot('stderr: config error');
      });
    });
  });
});
```

### `'multi'` (default)

Require a hint to be provided when there are multiple external snapshot matchers
within the scope (meaning it includes nested calls).

Examples of **incorrect** code for the `'multi'` option:

```js
const snapshotOutput = ({ stdout, stderr }) => {
  expect(stdout).toMatchSnapshot();
  expect(stderr).toMatchSnapshot();
};

describe('cli', () => {
  describe('--version flag', () => {
    it('prints the version', async () => {
      snapshotOutput(await runCli(['--version']));
    });
  });

  describe('--config flag', () => {
    it('reads the config', async () => {
      const { stdout, parsedConfig } = await runCli([
        '--config',
        'jest.config.js',
      ]);

      expect(stdout).toMatchSnapshot();
      expect(parsedConfig).toMatchSnapshot();
    });

    it('prints nothing to stderr', async () => {
      const { stderr } = await runCli(['--config', 'jest.config.js']);

      expect(stderr).toMatchSnapshot();
    });
  });
});
```

Examples of **correct** code for the `'multi'` option:

```js
const snapshotOutput = ({ stdout, stderr }, hints) => {
  expect(stdout).toMatchSnapshot({}, `stdout: ${hints.stdout}`);
  expect(stderr).toMatchSnapshot({}, `stderr: ${hints.stderr}`);
};

describe('cli', () => {
  describe('--version flag', () => {
    it('prints the version', async () => {
      snapshotOutput(await runCli(['--version']), {
        stdout: 'version string',
        stderr: 'empty',
      });
    });
  });

  describe('--config flag', () => {
    it('reads the config', async () => {
      const { stdout } = await runCli(['--config', 'jest.config.js']);

      expect(stdout).toMatchSnapshot();
    });

    it('prints nothing to stderr', async () => {
      const { stderr } = await runCli(['--config', 'jest.config.js']);

      expect(stderr).toMatchInlineSnapshot();
    });

    describe('when the file does not exist', () => {
      it('throws an error', async () => {
        await expect(
          runCli(['--config', 'does-not-exist.js']),
        ).rejects.toThrowErrorMatchingSnapshot();
      });
    });
  });
});
```
