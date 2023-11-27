import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui';
import { UploadIcon } from 'lucide-react';

function ImagePreviewDialog({ isOpen, onClose, file }) {
  const handleUpload = async () => {
    // Move the upload logic from `handleUpload` in `ProfilePicture.tsx` here
    // ...
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Image Preview</DialogTitle>
        </DialogHeader>
        <img src={URL.createObjectURL(file)} alt="Preview" />
        <button onClick={handleUpload}>
          <UploadIcon />
        </button>
      </DialogContent>
    </Dialog>
  );
}

export default ImagePreviewDialog;
