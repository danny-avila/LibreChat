import { atom } from "recoil";
import { logger } from "~/utils";

export interface CanvasData {
  messageId: string;
  content: string;
  title?: string;
}

export const canvasState = atom<CanvasData | null>({
  key: "canvasState",
  default: null,
  effects: [
    ({ onSet, node }) => {
      onSet(async (newValue) => {
        logger.log("canvas", "Recoil Effect: Setting canvasState", {
          key: node.key,
          newValue,
        });
      });
    },
  ] as const,
});

export const canvasVisibility = atom<boolean>({
  key: "canvasVisibility",
  default: true,
  effects: [
    ({ onSet, node }) => {
      onSet(async (newValue) => {
        logger.log("canvas", "Recoil Effect: Setting canvasVisibility", {
          key: node.key,
          newValue,
        });
      });
    },
  ] as const,
});
