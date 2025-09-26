import { useEffect, useRef } from "react";
import debounce from "lodash/debounce";
import { useLocation } from "react-router-dom";
import { useSetRecoilState, useResetRecoilState } from "recoil";
import { Palette } from "lucide-react";
import type { CanvasData } from "~/store/canvas";
import { logger } from "~/utils";
import { useLocalize } from "~/hooks";
import { canvasVisibility, canvasState } from "~/store/canvas";
import store from "~/store";

const CanvasButton = ({ canvas }: { canvas: CanvasData | null }) => {
  const localize = useLocalize();
  const location = useLocation();
  const setCanvasVisible = useSetRecoilState(canvasVisibility);
  const setCanvasData = useSetRecoilState(canvasState);
  const resetArtifactsState = useResetRecoilState(store.artifactsState);

  const debouncedSetVisibleRef = useRef(
    debounce((canvasToSet: CanvasData) => {
      logger.log(
        "canvas_visibility",
        "Setting canvas to visible state from Canvas button",
        canvasToSet,
      );
      setCanvasData(canvasToSet);
      setCanvasVisible(true);
    }, 750),
  );

  useEffect(() => {
    if (canvas == null || !canvas.content) {
      return;
    }

    if (!location.pathname.includes("/c/")) {
      return;
    }

    const debouncedSetVisible = debouncedSetVisibleRef.current;
    debouncedSetVisible(canvas);
    return () => {
      debouncedSetVisible.cancel();
    };
  }, [canvas, location.pathname]);

  if (canvas === null || canvas === undefined || !canvas.content) {
    return null;
  }

  return (
    <div className="group relative my-4 rounded-xl text-sm text-text-primary">
      <button
        type="button"
        onClick={() => {
          if (!location.pathname.includes("/c/")) {
            return;
          }

          // Clear artifacts data when opening Canvas
          resetArtifactsState();

          // Set both the Canvas data and visibility when button is clicked
          if (canvas) {
            setCanvasData(canvas);
          }
          setCanvasVisible(true);
        }}
        className="relative overflow-hidden rounded-xl border border-border-medium transition-all duration-300 hover:border-orange-600/40 hover:bg-orange-500/10 hover:shadow-lg"
      >
        <div className="w-fit bg-surface-tertiary p-2">
          <div className="flex flex-row items-center gap-2">
            <div className="relative flex h-10 w-10 items-center justify-center rounded bg-orange-500/10">
              <Palette className="h-5 w-5 text-orange-500" />
            </div>
            <div className="overflow-hidden text-left">
              <div className="truncate font-medium">{canvas.title}</div>
              <div className="truncate text-text-secondary">
                {localize("com_ui_canvas_click") || "Click to open Canvas"}
              </div>
            </div>
          </div>
        </div>
      </button>
      <br />
    </div>
  );
};

export default CanvasButton;
