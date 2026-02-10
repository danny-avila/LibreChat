import { useEffect } from 'react';
import { useSetRecoilState } from 'recoil';
import { FEATURES } from '~/components/Chat/featureConfig';
import store from '~/store';
import ChatRoute from './ChatRoute';

export default function FeaturePage({ featureKey }: { featureKey: string }) {
  const setActiveFeature = useSetRecoilState(store.activeFeature);

  useEffect(() => {
    const config = FEATURES[featureKey];
    document.title = config ? `$Ground Zero ${config.label} | Ground Zero` : 'Ground Zero';
    setActiveFeature(featureKey);
    return () => setActiveFeature(null);
  }, [featureKey, setActiveFeature]);

  return <ChatRoute />;
}
