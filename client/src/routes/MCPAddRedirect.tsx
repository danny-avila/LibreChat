import { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

const MCP_NAME_PARAM = 'mcp_name';
const MCP_URL_PARAM = 'mcp_url';
const MCP_TRANSPORT_PARAM = 'mcp_transport';

export default function MCPAddRedirect() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const mcpName = searchParams.get(MCP_NAME_PARAM) ?? undefined;
    const mcpUrl = searchParams.get(MCP_URL_PARAM) ?? undefined;
    const mcpTransport = searchParams.get(MCP_TRANSPORT_PARAM) ?? undefined;

    navigate('/c/new', {
      replace: true,
      state: { mcpName, mcpUrl, mcpTransport },
    });
  }, [searchParams, navigate]);

  return null;
}
