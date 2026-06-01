import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { MCPServerFormData } from '~/components/SidePanel/MCPBuilder/MCPServerDialog/hooks/useMCPServerForm';

const VALID_TRANSPORTS = new Set<MCPServerFormData['type']>(['streamable-http', 'sse']);

interface MCPDeepLinkState {
  mcpName?: string;
  mcpUrl?: string;
  mcpTransport?: string;
}

interface MCPDeepLinkResult {
  isOpen: boolean;
  initialValues: Partial<MCPServerFormData> | undefined;
  onOpenChange: (open: boolean) => void;
}

export default function useMCPDeepLink(): MCPDeepLinkResult {
  const location = useLocation();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [initialValues, setInitialValues] = useState<Partial<MCPServerFormData> | undefined>(
    undefined,
  );

  useEffect(() => {
    const state = location.state as MCPDeepLinkState | null;
    if (!state?.mcpName && !state?.mcpUrl) {
      return;
    }

    const values: Partial<MCPServerFormData> = {};
    if (state.mcpName) {
      values.title = state.mcpName;
    }
    if (state.mcpUrl) {
      values.url = state.mcpUrl;
    }
    if (
      state.mcpTransport &&
      VALID_TRANSPORTS.has(state.mcpTransport as MCPServerFormData['type'])
    ) {
      values.type = state.mcpTransport as MCPServerFormData['type'];
    }

    setInitialValues(values);
    setIsOpen(true);

    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state, location.pathname, navigate]);

  const onOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setInitialValues(undefined);
    }
  }, []);

  return { isOpen, initialValues, onOpenChange };
}
