import { useNavigate, useLocation } from 'react-router-dom';

const useOriginNavigate = () => {
  const _navigate = useNavigate();
  const location = useLocation();

  const navigate = (url?: string | null, opts = {}) => {
    if (!url) {
      return;
    }
    const path = location.pathname.match(/^\/[^/]+\//);
    _navigate(`${path ? path[0] : '/chat/'}${url}`, opts);
  };

  return navigate;
};

export default useOriginNavigate;
