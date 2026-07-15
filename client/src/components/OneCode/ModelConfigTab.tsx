import React, { useEffect, useMemo, useState } from 'react';
import { RotateCw, Save } from 'lucide-react';
import type { OneCodeModelConfig } from '~/onecode/project';

export default function ModelConfigTab({
  config,
  message,
  onLoad,
  onDiscover,
  onSave,
}: {
  config?: OneCodeModelConfig;
  message?: string;
  onLoad: () => void;
  onDiscover: (input: { endpoint: string; apiKey: string; model?: string; save?: boolean }) => void;
  onSave: (input: { endpoint: string; apiKey: string; model?: string; models?: string[] }) => void;
}) {
  const [endpoint, setEndpoint] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');

  useEffect(() => {
    setEndpoint(config?.endpoint || '');
    setModel(config?.model || '');
  }, [config?.endpoint, config?.model]);

  const models = useMemo(() => {
    const values = [...(config?.models || [])];
    if (model && !values.includes(model)) {
      values.unshift(model);
    }
    return values;
  }, [config?.models, model]);

  return (
    <div className="space-y-4 p-3 text-sm text-text-primary">
      <section className="space-y-2">
        <label
          className="block text-xs font-medium text-text-secondary"
          htmlFor="onecode-model-endpoint"
        >
          API endpoint
        </label>
        <input
          id="onecode-model-endpoint"
          value={endpoint}
          onChange={(event) => setEndpoint(event.target.value)}
          placeholder="https://api.example.com/v1/chat/completions"
          className="w-full rounded border border-border-light bg-surface-primary px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring-primary"
        />
      </section>

      <section className="space-y-2">
        <label
          className="block text-xs font-medium text-text-secondary"
          htmlFor="onecode-model-api-key"
        >
          API key
        </label>
        <input
          id="onecode-model-api-key"
          value={apiKey}
          type="password"
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={config?.api_key_preview ? '留空则保留已保存密钥' : 'sk-...'}
          className="w-full rounded border border-border-light bg-surface-primary px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring-primary"
        />
        {config?.api_key_preview && (
          <div className="text-xs text-text-secondary">已保存密钥: {config.api_key_preview}</div>
        )}
      </section>

      <section className="space-y-2">
        <label
          className="block text-xs font-medium text-text-secondary"
          htmlFor="onecode-model-select"
        >
          Model
        </label>
        <input
          id="onecode-model-select"
          value={model}
          onChange={(event) => setModel(event.target.value)}
          list="onecode-model-options"
          placeholder="gpt-5.5"
          className="w-full rounded border border-border-light bg-surface-primary px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring-primary"
        />
        <datalist id="onecode-model-options">
          {models.map((item) => (
            <option key={item} value={item} />
          ))}
        </datalist>
      </section>

      {message && (
        <div className="rounded border border-border-light p-2 text-xs text-text-secondary">
          {message}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-neutral btn-sm" onClick={onLoad}>
          <RotateCw className="icon-sm" />
          刷新配置
        </button>
        <button
          type="button"
          className="btn btn-neutral btn-sm"
          onClick={() => onDiscover({ endpoint, apiKey, model, save: false })}
          disabled={!endpoint || !apiKey}
        >
          <RotateCw className="icon-sm" />
          拉取模型
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => onSave({ endpoint, apiKey, model, models })}
          disabled={!endpoint || (!apiKey && !config?.api_key_preview) || !model}
        >
          <Save className="icon-sm" />
          保存
        </button>
      </div>
    </div>
  );
}
