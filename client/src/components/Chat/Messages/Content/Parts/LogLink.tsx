import React from 'react';
import { useCodeOutputDownload } from '~/data-provider';
import { useToastContext } from '~/Providers';

interface LogLinkProps {
  href: string;
  filename: string;
  children: React.ReactNode;
}

const LogLink: React.FC<LogLinkProps> = ({ href, filename, children }) => {
  const { showToast } = useToastContext();
  const { refetch: downloadFile } = useCodeOutputDownload(href);

  const handleDownload = async (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    try {
      const stream = await downloadFile();
      if (stream.data == null || stream.data === '') {
        console.error('Error downloading file: No data found');
        showToast({
          status: 'error',
          message: 'Error downloading file',
        });
        return;
      }
      const link = document.createElement('a');
      link.href = stream.data;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(stream.data);
    } catch (error) {
      console.error('Error downloading file:', error);
    }
  };

  return (
    <a
      href={href}
      onClick={handleDownload}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-400! visited:text-purple-400! hover:underline"
    >
      {children}
    </a>
  );
};

export default LogLink;
