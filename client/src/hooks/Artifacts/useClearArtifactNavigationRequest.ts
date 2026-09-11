import { useCallback } from 'react';
import { useResetRecoilState } from 'recoil';
import { useLocation, useNavigate } from 'react-router-dom';
import store from '~/store';

export default function useClearArtifactNavigationRequest(): () => void {
  const location = useLocation();
  const navigate = useNavigate();
  const resetArtifactNavigationRequest = useResetRecoilState(store.artifactNavigationRequest);

  return useCallback(() => {
    resetArtifactNavigationRequest();
    const params = new URLSearchParams(location.search);
    const hadArtifactRequest = params.has('artifact');
    params.delete('artifact');
    params.delete('artifactId');
    params.delete('artifactMessageId');
    if (!hadArtifactRequest) {
      return;
    }
    const search = params.toString();
    navigate(
      {
        pathname: location.pathname,
        search: search ? `?${search}` : '',
        hash: location.hash,
      },
      { replace: true, state: location.state },
    );
  }, [
    location.hash,
    location.pathname,
    location.search,
    location.state,
    navigate,
    resetArtifactNavigationRequest,
  ]);
}
