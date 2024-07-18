import React from 'react';

const DropdownMenu = ({
  devices,
  onClose,
  onSelect,
}: {
  devices: MediaDeviceInfo[];
  onClose: () => void;
  onSelect: (deviceId: string) => void;
}) => {
  const handleDeviceChange = (deviceId: string) => {
    onSelect(deviceId);
    onClose();
  };

  return (
    <div className="dropdown-menu z-[9999] w-full max-w-[180px] rounded-lg border border-gray-300/30 bg-white px-1 py-1.5 shadow-sm dark:border-gray-700/50 dark:bg-gray-900 dark:text-white">
      {devices.map((device) => (
        <div
          key={device.deviceId}
          className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
          onClick={() => handleDeviceChange(device.deviceId)}
        >
          <div className="flex items-center">
            <div className="line-clamp-1">{device.label || 'Camera'}</div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default DropdownMenu;
