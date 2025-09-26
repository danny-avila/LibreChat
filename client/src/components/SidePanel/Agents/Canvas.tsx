import { useFormContext } from "react-hook-form";
import { AgentCapabilities } from "librechat-data-provider";
import { Switch } from "~/../../packages/client/src/components/Switch";
import {
  HoverCard,
  HoverCardPortal,
  HoverCardContent,
  HoverCardTrigger,
} from "~/../../packages/client/src/components/HoverCard";
import CircleHelpIcon from "~/../../packages/client/src/svgs/CircleHelpIcon";
import type { AgentForm } from "~/common";
import { useLocalize } from "~/hooks";
import { ESide } from "~/common";

export default function Canvas() {
  const localize = useLocalize();
  const methods = useFormContext<AgentForm>();
  const { setValue, watch } = methods;

  const canvasMode = watch(AgentCapabilities.canvas);

  const handleCanvasChange = (value: boolean) => {
    setValue(AgentCapabilities.canvas, value, {
      shouldDirty: true,
    });
  };

  const isEnabled = Boolean(canvasMode);

  return (
    <div className="w-full">
      <div className="mb-1.5 flex items-center gap-2">
        <span>
          <label className="text-token-text-primary block font-medium">
            {localize("com_ui_canvas")}
          </label>
        </span>
      </div>
      <div className="flex flex-col gap-3">
        <SwitchItem
          id="canvas"
          label={localize("com_ui_canvas_toggle_agent")}
          checked={isEnabled}
          onCheckedChange={handleCanvasChange}
          hoverCardText={localize("com_ui_canvas_toggle")}
          disabled={true}
          // Canvas toggle is intentionally disabled; feature not ready for users yet.
        />
      </div>
    </div>
  );
}

function SwitchItem({
  id,
  label,
  checked,
  onCheckedChange,
  hoverCardText,
  disabled = false,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  hoverCardText: string;
  disabled?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between ${disabled ? "opacity-50 pointer-events-none" : ""}`}
    >
      <div className="flex items-center space-x-2">
        <Switch
          id={id}
          checked={checked}
          onCheckedChange={onCheckedChange}
          disabled={disabled}
          className="flex"
        />
        <label
          htmlFor={id}
          className="text-token-text-primary text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          {label}
        </label>
      </div>
      <HoverCard openDelay={300}>
        <HoverCardTrigger>
          <CircleHelpIcon className="h-4 w-4 cursor-pointer text-gray-400 hover:text-gray-600" />
        </HoverCardTrigger>
        <HoverCardPortal>
          <HoverCardContent side={ESide.Left} className="w-80">
            <div className="space-y-2">
              <p className="text-sm text-gray-600">{hoverCardText}</p>
            </div>
          </HoverCardContent>
        </HoverCardPortal>
      </HoverCard>
    </div>
  );
}
