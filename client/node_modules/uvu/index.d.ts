declare namespace uvu {
	type Crumbs = { __suite__: string; __test__: string };
	type Callback<T> = (context: T & Crumbs) => Promise<void> | void;

	interface Hook<T> {
		(hook: Callback<T>): void;
		each(hook: Callback<T>): void;
	}

	interface Test<T> {
		(name: string, test: Callback<T>): void;
		only(name: string, test: Callback<T>): void;
		skip(name?: string, test?: Callback<T>): void;
		before: Hook<T>;
		after: Hook<T>
		run(): void;
	}
}

type Context = Record<string, any>;

export type Test<T=Context> = uvu.Test<T>;
export type Callback<T=Context> = uvu.Callback<T>;

export const test: uvu.Test<Context>;
export function suite<T=Context>(title?: string, context?: T): uvu.Test<T>;
export function exec(bail?: boolean): Promise<void>;
