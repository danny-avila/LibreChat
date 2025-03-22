import mongoose, { Schema, Document } from 'mongoose';

export interface IAction extends Document {
  user: mongoose.Types.ObjectId;
  action_id: string;
  type: string;
  settings?: unknown;
  agent_id?: string;
  assistant_id?: string;
  metadata: {
    api_key?: string;
    auth: {
      authorization_type?: string;
      custom_auth_header?: string;
      type: 'service_http' | 'oauth' | 'none';
      authorization_content_type?: string;
      authorization_url?: string;
      client_url?: string;
      scope?: string;
      token_exchange_method: 'default_post' | 'basic_auth_header' | null;
      oauth_flow: 'auth_code_flow' | 'client_cred_flow' | null;
    };
    domain: string;
    privacy_policy_url?: string;
    raw_spec?: string;
    oauth_client_id?: string;
    oauth_client_secret?: string;
  };
}

// Define the Auth sub-schema with type-safety.
const AuthSchema = new Schema(
  {
    authorization_type: { type: String },
    custom_auth_header: { type: String },
    type: { type: String, enum: ['service_http', 'oauth', 'none'] },
    authorization_content_type: { type: String },
    authorization_url: { type: String },
    client_url: { type: String },
    scope: { type: String },
    token_exchange_method: { type: String, enum: ['default_post', 'basic_auth_header', null] },
    oauth_flow: { type: String, enum: ['auth_code_flow', 'client_cred_flow', null] },
  },
  { _id: false },
);

const Action = new Schema<IAction>({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
    required: true,
  },
  action_id: {
    type: String,
    index: true,
    required: true,
  },
  type: {
    type: String,
    default: 'action_prototype',
  },
  settings: Schema.Types.Mixed,
  agent_id: String,
  assistant_id: String,
  metadata: {
    api_key: String,
    auth: AuthSchema,
    domain: {
      type: String,
      required: true,
    },
    privacy_policy_url: String,
    raw_spec: String,
    oauth_client_id: String,
    oauth_client_secret: String,
  },
});

export default Action;
