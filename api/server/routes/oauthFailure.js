const MAX_LOG_VALUE_LENGTH = 300;

function normalizeLogValue(value) {
  if (value == null) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return normalizeLogValue(value.find((entry) => normalizeLogValue(entry)));
  }

  if (typeof value === 'string') {
    const trimmed = value.replace(/\s+/g, ' ').trim();
    if (!trimmed) {
      return undefined;
    }
    if (trimmed.length <= MAX_LOG_VALUE_LENGTH) {
      return trimmed;
    }
    return `${trimmed.slice(0, MAX_LOG_VALUE_LENGTH)}... [truncated]`;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return undefined;
}

function compactLogObject(log) {
  return Object.entries(log).reduce((acc, [key, value]) => {
    if (value !== undefined) {
      acc[key] = value;
    }
    return acc;
  }, {});
}

function getField(source, field) {
  if (!source) {
    return undefined;
  }
  if (typeof source === 'string') {
    return field === 'message' ? source : undefined;
  }
  if (typeof source === 'object') {
    return source[field];
  }
  return undefined;
}

function firstLogValue(...values) {
  for (const value of values) {
    const normalized = normalizeLogValue(value);
    if (normalized) {
      return normalized;
    }
  }
  return undefined;
}

function getCause(source) {
  const cause = getField(source, 'cause');
  return cause && typeof cause === 'object' ? cause : undefined;
}

function getHeader(req, headerName) {
  return normalizeLogValue(req?.headers?.[headerName]);
}

function getQueryValue(req, queryName) {
  return normalizeLogValue(req?.query?.[queryName]);
}

function hasQueryValue(req, queryName) {
  return getQueryValue(req, queryName) !== undefined;
}

function getRequestPath(req) {
  return firstLogValue(req?.path, req?.originalUrl?.split('?')[0]);
}

function popSessionFailureMessage(req) {
  const messages = req?.session?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return undefined;
  }
  return messages.pop();
}

function getOAuthFailureMessage(req, defaultMessage = 'OAuth authentication failed') {
  return firstLogValue(
    popSessionFailureMessage(req),
    getQueryValue(req, 'error_description'),
    getQueryValue(req, 'error'),
    defaultMessage,
  );
}

function buildOAuthFailureLog({ provider, req, err, info, defaultMessage }) {
  const errCause = getCause(err);
  const infoCause = getCause(info);
  return compactLogObject({
    provider,
    code: firstLogValue(
      getField(err, 'code'),
      getField(err, 'error'),
      getField(errCause, 'code'),
      getField(errCause, 'error'),
      getField(info, 'code'),
      getField(info, 'error'),
      getField(infoCause, 'code'),
      getField(infoCause, 'error'),
      getQueryValue(req, 'error'),
    ),
    name: firstLogValue(getField(err, 'name'), getField(info, 'name')),
    message: firstLogValue(
      getField(err, 'message'),
      getField(err, 'error_description'),
      getField(info, 'message'),
      getField(info, 'error_description'),
      getQueryValue(req, 'error_description'),
      getQueryValue(req, 'error'),
      defaultMessage,
    ),
    cause_code: firstLogValue(getField(errCause, 'code'), getField(infoCause, 'code')),
    cause_name: firstLogValue(getField(errCause, 'name'), getField(infoCause, 'name')),
    cause_message: firstLogValue(getField(errCause, 'message'), getField(infoCause, 'message')),
    has_code: hasQueryValue(req, 'code'),
    has_state: hasQueryValue(req, 'state'),
    query_error: getQueryValue(req, 'error'),
    query_error_description: getQueryValue(req, 'error_description'),
    method: normalizeLogValue(req?.method),
    path: getRequestPath(req),
    request_id: firstLogValue(req?.requestId, req?.id, getHeader(req, 'x-request-id')),
    host: getHeader(req, 'host'),
    forwarded_host: getHeader(req, 'x-forwarded-host'),
    forwarded_proto: getHeader(req, 'x-forwarded-proto'),
    forwarded_for: getHeader(req, 'x-forwarded-for'),
    real_ip: getHeader(req, 'x-real-ip'),
    user_agent: getHeader(req, 'user-agent'),
  });
}

function isOAuthProtocolFailure(err, info) {
  const errCause = getCause(err);
  const infoCause = getCause(info);
  const code = firstLogValue(
    getField(err, 'code'),
    getField(err, 'error'),
    getField(errCause, 'code'),
    getField(errCause, 'error'),
    getField(info, 'code'),
    getField(info, 'error'),
    getField(infoCause, 'code'),
    getField(infoCause, 'error'),
  );

  if (code?.startsWith('OAUTH_')) {
    return true;
  }

  const name = firstLogValue(
    getField(err, 'name'),
    getField(errCause, 'name'),
    getField(info, 'name'),
    getField(infoCause, 'name'),
  );
  if (name === 'AuthorizationResponseError') {
    return true;
  }

  const message = firstLogValue(
    getField(err, 'message'),
    getField(errCause, 'message'),
    getField(info, 'message'),
    getField(infoCause, 'message'),
  );

  return name === 'OperationProcessingError' && /invalid response/i.test(message ?? '');
}

module.exports = {
  buildOAuthFailureLog,
  getOAuthFailureMessage,
  isOAuthProtocolFailure,
};
