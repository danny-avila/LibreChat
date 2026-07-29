import { TMessage } from 'librechat-data-provider';
import MessageQuotes from './MessageQuotes';
import SkillPills from './SkillPills';
import Files from './Files';

const Container = ({
  children,
  message,
  showFiles = true,
}: {
  children: React.ReactNode;
  message?: TMessage;
  /**
   * `ContentParts` renders the message's files once, above the parts, for every
   * message that has content. Its edit branch renders one `EditTextPart` per
   * text *and* think part, and each of those wraps its output in a container —
   * so an assistant turn with reasoning and a generated file rendered the file
   * twice until those containers opted out.
   */
  showFiles?: boolean;
}) => (
  <div
    className="text-message flex min-h-[20px] flex-col items-start gap-3 overflow-visible [.text-message+&]:mt-5"
    dir="auto"
  >
    {message?.isCreatedByUser === true && <MessageQuotes quotes={message.quotes} />}
    {/* Not user-only: an assistant message can carry attachments — voice-mode
        audio — that no content part renders. This is the path for messages
        with no content at all; `ContentParts` covers the rest. */}
    {showFiles && message?.files != null && message.files.length > 0 && (
      <Files files={message.files} />
    )}
    {message?.isCreatedByUser === true && (
      <>
        <SkillPills skills={message.alwaysAppliedSkills} source="always-apply" />
        <SkillPills skills={message.manualSkills} source="manual" />
      </>
    )}
    {children}
  </div>
);

export default Container;
