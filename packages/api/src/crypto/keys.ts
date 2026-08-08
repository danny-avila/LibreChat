/**
 * Restores a PEM that was supplied as a single-line environment value.
 *
 * Secret stores, CI variables and container runtimes routinely flatten a
 * private key into one line with literal `\n` escapes. Node's key parser
 * rejects that form outright, so every consumer of an inline PEM has to undo
 * it before handing the value to a signer.
 */
export const normalizePem = (value: string): string => value.replace(/\\n/g, '\n').trim();
