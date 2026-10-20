/** `bcryptjs` ships no types. Declared narrowly: only the synchronous calls run, inside the hash worker. */
declare module 'bcryptjs' {
  export function hashSync(plain: string, rounds: number): string;
  export function compareSync(plain: string, hash: string): boolean;
}
