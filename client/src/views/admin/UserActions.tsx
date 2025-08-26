import React from "react";
import { Button } from "~/components/ui/Button";
import { Info } from "lucide-react";

interface User {
  _id: string;
  email?: string;
  username?: string;
  role?: string;
}

interface UserActionsProps {
  user: User;
  onToggleRole: (id: string, nextRole: string) => void;
  onView: (user: User) => void;
  onDelete: (id: string) => void;
}

export const UserActions: React.FC<UserActionsProps> = ({
  user,
  onToggleRole,
  onView,
  onDelete,
}) => {
  const toggleRole = user.role === "ADMIN" ? "USER" : "ADMIN";

  return (
    <div className="flex justify-center items-center gap-2">
      <Button
        size="sm"
        variant="secondary"
        onClick={() => onToggleRole(user._id, toggleRole)}
      >
        Set {toggleRole}
      </Button>

      <Button
        size="icon"
        variant="neutral"
        onClick={() => onView(user)}
        aria-label="View User Info"
      >
        <Info className="h-4 w-4" />
      </Button>

      <Button
        size="sm"
        variant="destructive"
        onClick={() => onDelete(user._id)}
      >
        Delete
      </Button>
    </div>
  );
};
