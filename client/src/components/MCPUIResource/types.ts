export interface UIResourceNode {
  type: string;
  value?: string;
  data?: {
    hName: string;
    hProperties: {
      resourceId?: string;
      resourceIds?: string[];
    };
  };
  children?: UIResourceNode[];
}
