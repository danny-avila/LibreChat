/**
 * Hook to detect if the user is on a mobile device
 * Notice that this hook will only detect the device type in effect, so it will always be false in server side
 */
declare const useMobile: () => boolean;
export default useMobile;
