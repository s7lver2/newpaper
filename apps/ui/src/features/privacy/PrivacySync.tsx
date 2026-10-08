import { useEffect } from 'react';
import { startPrivacySync } from './usePrivacy';

export function PrivacySync() {
  useEffect(() => {
    const stop = startPrivacySync().catch(() => () => {});
    return () => void stop.then((f) => f());
  }, []);
  return null;
}
