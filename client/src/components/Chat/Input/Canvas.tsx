import React, { memo, useMemo, useCallback } from "react";
import CheckboxButton from "~/../../packages/client/src/components/CheckboxButton";
import { Palette } from "lucide-react";
import { useSetRecoilState } from "recoil";
import { useLocalize } from "~/hooks";
import { useBadgeRowContext } from "~/Providers";
import { canvasVisibility } from "~/store/canvas";

function Canvas() {
  const localize = useLocalize();
  const { canvas } = useBadgeRowContext();
  const { toggleState, handleChange, isPinned } = canvas;
  const _setCanvasVisible = useSetRecoilState(canvasVisibility);

  // Debug: Check localStorage directly
  console.log("Canvas First Load Debug:", {
    isPinned,
    localStorage_key: localStorage.getItem("LAST_CANVAS_TOGGLE_pinned"),
    localStorage_all_canvas: Object.keys(localStorage).filter((k) =>
      k.includes("CANVAS"),
    ),
  });

  const isEnabled = useMemo(() => {
    if (typeof toggleState === "string" && toggleState) {
      return true;
    }
    if (toggleState === true) {
      return true;
    }
    return false;
  }, [toggleState]);

  const handleToggle = useCallback(() => {
    if (isEnabled) {
      handleChange({ value: "" });
    } else {
      handleChange({ value: "enabled" });
    }
  }, [isEnabled, handleChange]);

  return (
    <>
      {(isEnabled || isPinned) && (
        <CheckboxButton
          className="max-w-fit"
          checked={isEnabled}
          setValue={handleToggle}
          label={`${localize("com_ui_canvas")}`}
          isCheckedClassName="border-orange-600/40 bg-orange-500/10 hover:bg-orange-700/10"
          icon={<Palette className="icon-md" />}
        />
      )}
    </>
  );
}

export default memo(Canvas);
