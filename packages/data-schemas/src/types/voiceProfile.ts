export interface IVoiceProfile {
  _id?: string;
  name: string;
  instruct: string;
  authorizedConfigRoles: string[];
  authorizedConfigGroups: string[];
  authorizedUseRoles: string[];
  authorizedUseGroups: string[];
  tenantId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
