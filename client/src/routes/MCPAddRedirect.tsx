import { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useGetStartupConfig } from '~/data-provider';

const MCP_NAME_PARAM = 'name';
const MCP_URL_PARAM = 'url';
const MCP_TRANSPORT_PARAM = 'transport';

export default function MCPAddRedirect() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { data: startupConfig, isLoading, isError } = useGetStartupConfig();
  const deepLinksEnabled =
    !isError && startupConfig != null && startupConfig.interface?.mcpServers?.deepLinks !== false;

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const mcpName = searchParams.get(MCP_NAME_PARAM) ?? undefined;
    const mcpUrl = searchParams.get(MCP_URL_PARAM) ?? undefined;
    const mcpTransport = searchParams.get(MCP_TRANSPORT_PARAM) ?? undefined;

    navigate('/c/new', {
      replace: true,
      state: deepLinksEnabled ? { mcpName, mcpUrl, mcpTransport } : null,
    });
  }, [deepLinksEnabled, isLoading, searchParams, navigate]);

  return null;
}
