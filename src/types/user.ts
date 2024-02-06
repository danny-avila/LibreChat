export type User = {
  cache_enabled: boolean;
  user_id: string;
  authnumber_userid: string;
  username: string;
  email: string;
  roles: string[];
  max_token: number;
  max_requests: number;
  curr_requests: number;
  images_allowed: boolean;
  text_allowed: boolean;
  code_allowed: boolean;
  video_allowed: boolean;
  upload_allowed: boolean;
  max_prompts: null | number;
  current_model_id: string;
  _allowed_models: string;
  org_id: string;
  org_name: string;
};

export type CreateUserForm = {
  username: string;
  email: string;
  password: string;
  is_admin: boolean;
};

export type UpdateUserForm = {
  cache_enabled: boolean;
  total_tokens: number;
  prompt_tokens: null | number;
  max_api_calls: number;
  images_allowed: boolean;
  any_upload_allowed: boolean;
  text_allowed: boolean;
  video_allowed: boolean;
  is_admin: boolean;
  code_allowed: boolean;
  allowed_models: string;
};
