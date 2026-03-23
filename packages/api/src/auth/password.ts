interface UserWithPassword {
  password?: string;
  [key: string]: unknown;
}

export interface ComparePasswordDeps {
  compare: (candidatePassword: string, hash: string) => Promise<boolean>;
}

/** Compares a candidate password against a user's hashed password. */
export async function comparePassword(
  user: UserWithPassword,
  candidatePassword: string,
  deps: ComparePasswordDeps,
): Promise<boolean> {
  if (!user) {
    throw new Error('No user provided');
  }

  if (!user.password) {
    throw new Error('No password, likely an email first registered via Social/OIDC login');
  }

  return deps.compare(candidatePassword, user.password);
}
