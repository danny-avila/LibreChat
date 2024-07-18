import React from 'react';

const DropdownMenu = ({
  devices,
  onSelect,
}: {
  devices: MediaDeviceInfo[];
  onSelect: (deviceId: string) => void;
}) => {
  const [show, setShow] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  const handleClickOutside = (event: MouseEvent) => {
    if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
      setShow(false);
    }
  };

  React.useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button onClick={() => setShow(!show)} className="dropdown-toggle">
        Select Camera
      </button>
      {show && (
        <div className="dropdown-menu z-[9999] w-full max-w-[180px] rounded-md border border-gray-300/30 bg-white px-1 py-1.5 text-black shadow-sm dark:border-gray-700/50 dark:bg-gray-900 dark:text-white">
          {devices.map((device) => (
            <div
              key={device.deviceId}
              className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
              onClick={() => {
                onSelect(device.deviceId);
                setShow(false);
              }}
            >
              <div className="flex items-center">
                <div className="line-clamp-1">{device.label || 'Camera'}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DropdownMenu;
