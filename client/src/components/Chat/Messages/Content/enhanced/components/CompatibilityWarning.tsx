import React, { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { CompatibilityResult, getFeatureName } from '../utils/BrowserCompatibility';

interface CompatibilityWarningProps {
  feature: string;
  compatibility: CompatibilityResult;
  showDetails?: boolean;
  className?: string;
}

export const CompatibilityWarning: React.FC<CompatibilityWarningProps> = ({
  feature,
  compatibility,
  showDetails = false,
  className = '',
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (compatibility.isSupported) {
    return null;
  }

  const featureName = getFeatureName(feature);

  return (
    <div className={`compatibility-warning bg-yellow-50 border border-yellow-200 rounded-lg p-3 ${className}`}>
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-yellow-800">
              {featureName} Not Supported
            </h4>
            {showDetails && compatibility.missingFeatures.length > 0 && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="text-yellow-600 hover:text-yellow-800 transition-colors"
                aria-label={isExpanded ? 'Hide details' : 'Show details'}
              >
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>
            )}
          </div>
          
          {compatibility.fallbackMessage && (
            <p className="text-sm text-yellow-700 mt-1">
              {compatibility.fallbackMessage}
            </p>
          )}

          {showDetails && isExpanded && compatibility.missingFeatures.length > 0 && (
            <div className="mt-2 p-2 bg-yellow-100 rounded border">
              <p className="text-xs font-medium text-yellow-800 mb-1">
                Missing browser features:
              </p>
              <ul className="text-xs text-yellow-700 space-y-1">
                {compatibility.missingFeatures.map((missingFeature) => (
                  <li key={missingFeature} className="flex items-center gap-1">
                    <span className="w-1 h-1 bg-yellow-600 rounded-full"></span>
                    {getFeatureName(missingFeature)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface BrowserUpdatePromptProps {
  className?: string;
}

export const BrowserUpdatePrompt: React.FC<BrowserUpdatePromptProps> = ({
  className = '',
}) => {
  return (
    <div className={`browser-update-prompt bg-blue-50 border border-blue-200 rounded-lg p-3 ${className}`}>
      <div className="flex items-start gap-2">
        <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h4 className="text-sm font-medium text-blue-800">
            Update Your Browser
          </h4>
          <p className="text-sm text-blue-700 mt-1">
            For the best experience with enhanced content features, please update to the latest version of your browser.
          </p>
          <div className="mt-2 text-xs text-blue-600">
            <p>Recommended browsers:</p>
            <ul className="mt-1 space-y-1">
              <li>• Chrome 90+</li>
              <li>• Firefox 88+</li>
              <li>• Safari 14+</li>
              <li>• Edge 90+</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

interface FeatureUnavailableProps {
  featureName: string;
  reason?: string;
  suggestion?: string;
  className?: string;
}

export const FeatureUnavailable: React.FC<FeatureUnavailableProps> = ({
  featureName,
  reason,
  suggestion,
  className = '',
}) => {
  return (
    <div className={`feature-unavailable bg-gray-50 border border-gray-200 rounded-lg p-3 ${className}`}>
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h4 className="text-sm font-medium text-gray-700">
            {featureName} Unavailable
          </h4>
          {reason && (
            <p className="text-sm text-gray-600 mt-1">
              {reason}
            </p>
          )}
          {suggestion && (
            <p className="text-sm text-gray-600 mt-1 font-medium">
              {suggestion}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};