import { useFormContext } from 'react-hook-form';
import type { ActionAuthForm } from '~/common';
import useLocalize from '~/hooks/useLocalize';

export default function MCPInput() {
    const localize = useLocalize();
    const { register } = useFormContext<ActionAuthForm>();

    return (
        <div className="space-y-4">
            <div className="relative my-1">
                <div className="mb-1.5 flex items-center">
                    <label className="text-token-text-primary block font-medium">
                        {localize('com_assistants_mcp_url')}
                    </label>
                </div>
                <div className="border-token-border-medium bg-token-surface-primary hover:border-token-border-hover flex h-9 w-full rounded-lg border">
                    <input
                        type="text"
                        {...register('url', { required: true })}
                        placeholder="https://mcp.example.com"
                        className="flex-1 rounded-lg bg-transparent px-3 py-1.5 text-sm outline-none placeholder:text-text-secondary-alt focus:ring-1 focus:ring-border-light"
                    />
                </div>
            </div>

            <div className="relative my-1">
                <div className="mb-1.5 flex items-center">
                    <label className="text-token-text-primary block font-medium">
                        {localize('com_assistants_mcp_label')}
                    </label>
                </div>
                <div className="border-token-border-medium bg-token-surface-primary hover:border-token-border-hover flex h-9 w-full rounded-lg border">
                    <input
                        type="text"
                        {...register('label', { required: true })}
                        placeholder={localize('com_assistants_my_mcp_server')}
                        className="flex-1 rounded-lg bg-transparent px-3 py-1.5 text-sm outline-none placeholder:text-text-secondary-alt focus:ring-1 focus:ring-border-light"
                    />
                </div>
            </div>

            <div className="flex items-center justify-end">
                <button
                    type="submit"
                    className="focus:shadow-outline mt-1 flex min-w-[100px] items-center justify-center rounded bg-green-500 px-4 py-2 font-semibold text-white hover:bg-green-400 focus:border-green-500 focus:outline-none focus:ring-0 disabled:bg-green-400"
                >
                    {localize('com_ui_create')}
                </button>
            </div>
        </div>
    );
} 