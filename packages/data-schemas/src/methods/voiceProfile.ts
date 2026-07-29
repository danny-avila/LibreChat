import type * as t from '~/types';

export function createVoiceProfileMethods(mongoose: typeof import('mongoose')): {
  getVoiceInstructForUser: (user: Partial<t.IUser> | undefined, voiceName: string) => Promise<string | null>;
  canUserConfigureVoice: (user: Partial<t.IUser> | undefined, voiceName: string) => Promise<boolean>;
} {
  async function getVoiceInstructForUser(user: Partial<t.IUser> | undefined, voiceName: string): Promise<string | null> {
    if (!user) {
      return null;
    }

    const VoiceProfile = mongoose.models.VoiceProfile;
    const profile = await VoiceProfile.findOne({ name: voiceName });
    if (!profile) {
      return null;
    }

    const hasRoleAccess = user.role ? profile.authorizedUseRoles.includes(user.role) : false;
    
    let hasGroupAccess = false;
    if (profile.authorizedUseGroups && profile.authorizedUseGroups.length > 0) {
      const Group = mongoose.models.Group;
      const memberQuery = user.idOnTheSource
        ? { memberIds: { $in: [user.id, user.idOnTheSource] } }
        : { memberIds: user.id };
      const userGroups = await Group.find(memberQuery);
      const userGroupNames = userGroups.map((g: any) => g.name);
      const userGroupIds = userGroups.map((g: any) => g._id.toString());
      
      hasGroupAccess = profile.authorizedUseGroups.some((group: string) => 
        userGroupNames.includes(group) || userGroupIds.includes(group)
      );
    } else {
      hasGroupAccess = true;
    }

    if (hasRoleAccess && hasGroupAccess) {
      return profile.instruct;
    }

    throw new Error(`You do not have access to the voice profile: ${voiceName}`);
  }

  async function canUserConfigureVoice(user: Partial<t.IUser> | undefined, voiceName: string): Promise<boolean> {
    if (!user) return false;
    if (user.role === 'ADMIN') return true;

    const VoiceProfile = mongoose.models.VoiceProfile;
    const profile = await VoiceProfile.findOne({ name: voiceName });
    if (!profile) {
      return false;
    }

    const hasRoleAccess = user.role ? profile.authorizedConfigRoles.includes(user.role) : false;
    let hasGroupAccess = false;

    if (profile.authorizedConfigGroups && profile.authorizedConfigGroups.length > 0) {
      const Group = mongoose.models.Group;
      const memberQuery = user.idOnTheSource
        ? { memberIds: { $in: [user.id, user.idOnTheSource] } }
        : { memberIds: user.id };
      const userGroups = await Group.find(memberQuery);
      const userGroupNames = userGroups.map((g: any) => g.name);
      const userGroupIds = userGroups.map((g: any) => g._id.toString());

      hasGroupAccess = profile.authorizedConfigGroups.some((group: string) => 
        userGroupNames.includes(group) || userGroupIds.includes(group)
      );
    } else {
      hasGroupAccess = true;
    }

    return hasRoleAccess && hasGroupAccess;
  }

  return {
    getVoiceInstructForUser,
    canUserConfigureVoice,
  };
}

export type VoiceProfileMethods = ReturnType<typeof createVoiceProfileMethods>;
