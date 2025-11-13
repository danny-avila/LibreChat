const ErrorTypes = {
    THROTTLING_ERROR: 'THROTTLING_ERROR',
    VALIDATION_ERROR: 'VALIDATION_ERROR', 
    RESOURCE_ERROR: 'RESOURCE_ERROR',
    MODEL_ERROR: 'MODEL_ERROR',
    REQUEST_ERROR: 'REQUEST_ERROR',
    NETWORK_ERROR: 'NETWORK_ERROR',
    AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
    CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
    DATABASE_ERROR: 'DATABASE_ERROR',
    PERMISSION_ERROR: 'PERMISSION_ERROR',
    UNKNOWN_ERROR: 'UNKNOWN_ERROR'
  };
  
  const ErrorPatterns = {
    [ErrorTypes.THROTTLING_ERROR]: [
      /rate limit/i,
      /quota exceeded/i,
      /too many requests/i,
      /throttled/i,
      /429/,
      /overloaded/i,
      /capacity/i,
      /rate_limit_exceeded/i,
      /anthropic.*temporarily overloaded/i
    ],
    [ErrorTypes.VALIDATION_ERROR]: [
      /invalid parameter/i,
      /validation error/i,
      /invalid input/i,
      /parameter.*required/i,
      /malformed.*parameter/i,
      /invalid.*format/i,
      /invalid request/i
    ],
    [ErrorTypes.RESOURCE_ERROR]: [
      /context.*too large/i,
      /token limit/i,
      /context window/i,
      /memory.*full/i,
      /out of memory/i,
      /maximum.*tokens/i,
      /context.*exceeded/i,
      /INPUT_LENGTH/i,
      /context_length_exceeded/i
    ],
    [ErrorTypes.MODEL_ERROR]: [
      /model.*not found/i,
      /model.*unavailable/i,
      /model.*not supported/i,
      /decommissioned/i,
      /no longer supported/i,
      /invalid model/i,
      /model.*does not exist/i,
      /deployment.*not found/i
    ],
    [ErrorTypes.REQUEST_ERROR]: [
      /bad request/i,
      /malformed/i,
      /invalid json/i,
      /400/,
      /syntax error/i,
      /parse error/i
    ],
    [ErrorTypes.NETWORK_ERROR]: [
      /network/i,
      /timeout/i,
      /connection/i,
      /unreachable/i,
      /econnrefused/i,
      /enotfound/i,
      /socket/i,
      /dns/i
    ],
    [ErrorTypes.AUTHENTICATION_ERROR]: [
      /oauth/i,
      /unauthorized/i,
      /401/,
      /authentication/i,
      /auth.*required/i,
      /invalid.*token/i,
      /expired.*token/i,
      /user mismatch/i,
      /access denied/i,
      /not authenticated/i,
      /flow not found/i,
      /invalid state/i
    ],
    [ErrorTypes.CONFIGURATION_ERROR]: [
      /config.*not found/i,
      /missing.*configuration/i,
      /invalid.*config/i,
      /not.*configured/i,
      /server.*not found/i,
      /mcp.*not found/i,
      /missing server url/i,
      /invalid flow state/i
    ],
    [ErrorTypes.DATABASE_ERROR]: [
      /database/i,
      /mongoose/i,
      /mongodb/i,
      /collection/i,
      /document not found/i,
      /save.*failed/i,
      /update.*failed/i,
      /delete.*failed/i,
      /message not found/i,
      /conversation not found/i,
      /artifact.*not found/i
    ],
    [ErrorTypes.PERMISSION_ERROR]: [
      /permission/i,
      /forbidden/i,
      /403/,
      /access.*denied/i,
      /not.*authorized/i,
      /user.*mismatch/i,
      /invalid.*user/i
    ]
  };
  
  const UserMessages = {
    [ErrorTypes.THROTTLING_ERROR]: {
      title: "Service Temporarily Unavailable",
      message: "The AI service is currently experiencing high demand. Please wait a moment and try again.",
      suggestion: "Try again in a few seconds, or switch to a different model if available."
    },
    [ErrorTypes.VALIDATION_ERROR]: {
      title: "Invalid Request Parameters", 
      message: "There was an issue with the request parameters sent to the service.",
      suggestion: "Please check your input and try again. If using tools, verify the parameters are correct."
    },
    [ErrorTypes.RESOURCE_ERROR]: {
      title: "Resource Limit Exceeded",
      message: "The request exceeded available resources (memory, token limits, or context window).",
      suggestion: "Try shortening your message, reducing context, or starting a new conversation."
    },
    [ErrorTypes.MODEL_ERROR]: {
      title: "Model Not Available",
      message: "The requested AI model is currently unavailable or doesn't exist.",
      suggestion: "Try selecting a different model from the available options."
    },
    [ErrorTypes.REQUEST_ERROR]: {
      title: "Request Format Error",
      message: "The request could not be processed due to formatting issues.",
      suggestion: "Please try rephrasing your request or contact support if the issue persists."
    },
    [ErrorTypes.NETWORK_ERROR]: {
      title: "Connection Error",
      message: "Unable to connect to the AI service due to network issues.",
      suggestion: "Check your internet connection and try again. If the problem persists, the service may be temporarily down."
    },
    [ErrorTypes.AUTHENTICATION_ERROR]: {
      title: "Authentication Required",
      message: "You need to authenticate to access this service.",
      suggestion: "Please log in or complete the authentication process to continue."
    },
    [ErrorTypes.CONFIGURATION_ERROR]: {
      title: "Configuration Error",
      message: "There's an issue with the service configuration.",
      suggestion: "Please contact your administrator to check the service configuration."
    },
    [ErrorTypes.DATABASE_ERROR]: {
      title: "Data Access Error",
      message: "There was a problem accessing or updating the requested data.",
      suggestion: "Please refresh the page and try again. If the issue persists, contact support."
    },
    [ErrorTypes.PERMISSION_ERROR]: {
      title: "Access Denied",
      message: "You don't have permission to perform this action.",
      suggestion: "Please check your permissions or contact an administrator."
    },
    [ErrorTypes.UNKNOWN_ERROR]: {
      title: "Unexpected Error",
      message: "An unexpected error occurred while processing your request.",
      suggestion: "Please try again. If the problem continues, contact support."
    }
  };
  
  class ErrorClassifier {
    static classifyError(error) {
      const errorString = this.getErrorString(error);
      
      for (const [errorType, patterns] of Object.entries(ErrorPatterns)) {
        if (patterns.some(pattern => pattern.test(errorString))) {
          return errorType;
        }
      }
      
      return ErrorTypes.UNKNOWN_ERROR;
    }
  
    static getErrorString(error) {
      if (typeof error === 'string') return error;
      if (error?.message) return error.message;
      if (error?.error?.message) return error.error.message;
      if (error?.response?.data?.error?.message) return error.response.data.error.message;
      if (error?.response?.statusText) return error.response.statusText;
      return JSON.stringify(error);
    }
  
    static getUserFriendlyError(error, context = {}) {
      const errorType = this.classifyError(error);
      const userMessage = UserMessages[errorType];
      const originalError = this.getErrorString(error);
      
      return {
        type: errorType,
        title: userMessage.title,
        message: userMessage.message,
        suggestion: userMessage.suggestion,
        originalError: originalError,
        context: context,
        timestamp: new Date().toISOString()
      };
    }
  
    static shouldRetry(errorType) {
      return [
        ErrorTypes.THROTTLING_ERROR,
        ErrorTypes.NETWORK_ERROR
      ].includes(errorType);
    }
  
    static getRetryDelay(errorType, attempt = 1) {
      const delays = {
        [ErrorTypes.THROTTLING_ERROR]: Math.min(1000 * Math.pow(2, attempt), 30000), // Exponential backoff
        [ErrorTypes.NETWORK_ERROR]: 2000 * attempt, // Linear backoff
      };
      return delays[errorType] || 0;
    }
  }
  
  module.exports = {
    ErrorTypes,
    ErrorClassifier,
    UserMessages
  };