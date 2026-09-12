export interface DirectoryPrincipalUser {
  id: string;
}

export interface ResolveDirectoryPrincipalUserParams {
  userBySourceId?: DirectoryPrincipalUser | null;
  userByEmail?: DirectoryPrincipalUser | null;
}

export const resolveDirectoryPrincipalUser = ({
  userBySourceId,
  userByEmail,
}: ResolveDirectoryPrincipalUserParams): string | null => {
  if (userBySourceId) {
    return userBySourceId.id;
  }

  if (userByEmail) {
    throw new Error('Existing user must link their directory identity during sign-in');
  }

  return null;
};
