export interface UIResourceNode {
  type: string;
  value?: string;
  data?: {
    hName: string;
    hProperties: {
      resourceIndex?: number;
      resourceIndices?: number[];
    };
  };
  children?: UIResourceNode[];
}
