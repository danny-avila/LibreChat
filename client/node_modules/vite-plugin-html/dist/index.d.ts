import { HtmlTagDescriptor, PluginOption } from 'vite';
import { Options as Options$1 } from 'ejs';
import { Options } from 'html-minifier-terser';

interface InjectOptions {
    /**
     *  @description Data injected into the html template
     */
    data?: Record<string, any>;
    tags?: HtmlTagDescriptor[];
    /**
     * @description ejs options configuration
     */
    ejsOptions?: Options$1;
}
interface PageOption {
    filename: string;
    template: string;
    entry?: string;
    injectOptions?: InjectOptions;
}
declare type Pages = PageOption[];
interface UserOptions {
    /**
     * @description Page options
     */
    pages?: Pages;
    /**
     * @description Minimize options
     */
    minify?: Options | boolean;
    /**
     * page entry
     */
    entry?: string;
    /**
     * template path
     */
    template?: string;
    /**
     * @description inject options
     */
    inject?: InjectOptions;
    /**
     * output warning log
     * @default false
     */
    verbose?: boolean;
}

declare function createHtmlPlugin(userOptions?: UserOptions): PluginOption[];

export { createHtmlPlugin };
