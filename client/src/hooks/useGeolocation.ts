import { useState } from 'react';

interface UseGeolocationOptions {
  onSuccess: (latitude: number, longitude: number) => void;
}

export default function useGeolocation({ onSuccess }: UseGeolocationOptions) {
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState('');

  const getLocation = () => {
    setIsLocating(true);
    setLocationError('');

    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser');
      setIsLocating(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        onSuccess(position.coords.latitude, position.coords.longitude);
        setIsLocating(false);
      },
      () => {
        setLocationError('Unable to retrieve your location');
        setIsLocating(false);
      },
    );
  };

  return { isLocating, locationError, getLocation };
}
