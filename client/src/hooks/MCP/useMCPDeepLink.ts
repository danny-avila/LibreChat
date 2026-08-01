import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { MCPServerInitialValues } from '~/components/SidePanel/MCPBuilder/MCPServerDialog/hooks/useMCPServerForm';

type MCPTransport = NonNullable<MCPServerInitialValues['type']>;

const isValidTransport = (transport: string): transport is MCPTransport =>
  transport === 'streamable-http' || transport === 'sse';

interface MCPDeepLinkState {
  mcpName?: string;
  mcpUrl?: string;
  mcpTransport?: string;
}

export interface MCPDeepLinkResult {
  isOpen: boolean;
  initialValues: MCPServerInitialValues | undefined;
  onOpenChange: (open: boolean) => void;
}

export default function useMCPDeepLink(): MCPDeepLinkResult {
  const location = useLocation();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [initialValues, setInitialValues] = useState<MCPServerInitialValues>();

  useEffect(() => {
    const state = location.state as MCPDeepLinkState | null;
    if (!state?.mcpName && !state?.mcpUrl) {
      return;
    }

    const values: MCPServerInitialValues = {};
    if (state.mcpName) {
      values.title = state.mcpName;
    }
    if (state.mcpUrl) {
      values.url = state.mcpUrl;
    }
    if (state.mcpTransport && isValidTransport(state.mcpTransport)) {
      values.type = state.mcpTransport;
    }

    setInitialValues(values);
    setIsOpen(true);

    navigate(
      {
        pathname: location.pathname,
        search: location.search,
        hash: location.hash,
      },
      { replace: true, state: null },
    );
  }, [location, navigate]);

  const onOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setInitialValues(undefined);
    }
  }, []);

  return { isOpen, initialValues, onOpenChange };
}
