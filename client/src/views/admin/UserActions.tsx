import React, { useState } from "react";
import { Button } from "~/components/ui/Button";
import { Info } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/Dialog";

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
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleDelete = () => {
    setConfirmOpen(false);
    onDelete(user._id);
  };

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

      {/* Delete button: transparent, black text; hover black bg with white text */}
      <Button
        size="sm"
        variant="ghost"
        className="text-black hover:bg-black hover:text-white focus-visible:ring-0"
        onClick={() => setConfirmOpen(true)}
      >
        Delete
      </Button>

      {/* Confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm deletion</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-gray-600">
                 Are you sure you want to delete this user?
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
            >
              Confirm Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
