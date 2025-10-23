export * from './queries';
export * from './mutations';

// Re-export commonly used hooks for easier imports
export { useMcpServersQuery, useMcpServerQuery, defaultMcpServerParams } from './queries';
export {
  useCreateMcpServerMutation,
  useUpdateMcpServerMutation,
  useDeleteMcpServerMutation,
} from './mutations';
