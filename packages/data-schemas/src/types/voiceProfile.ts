export interface IVoiceProfile {
  _id?: string;
  name: string;
  instruct: string;
  authorizedConfigRoles: string[];
  authorizedConfigGroups: string[];
  authorizedUseRoles: string[];
  authorizedUseGroups: string[];
  createdAt?: Date;
  updatedAt?: Date;
}
