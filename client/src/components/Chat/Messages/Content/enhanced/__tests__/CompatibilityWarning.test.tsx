import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  CompatibilityWarning,
  BrowserUpdatePrompt,
  FeatureUnavailable,
} from '../components/CompatibilityWarning';
import type { CompatibilityResult } from '../utils/BrowserCompatibility';

describe('CompatibilityWarning', () => {
  const mockCompatibilityUnsupported: CompatibilityResult = {
    isSupported: false,
    missingFeatures: ['speechSynthesis', 'webWorkers'],
    fallbackMessage: 'This feature is not supported in your browser.',
  };

  const mockCompatibilitySupported: CompatibilityResult = {
    isSupported: true,
    missingFeatures: [],
  };

  describe('CompatibilityWarning component', () => {
    it('should not render when feature is supported', () => {
      const { container } = render(
        <CompatibilityWarning
          feature="tts"
          compatibility={mockCompatibilitySupported}
        />
      );

      expect(container.firstChild).toBeNull();
    });

    it('should render warning when feature is not supported', () => {
      render(
        <CompatibilityWarning
          feature="tts"
          compatibility={mockCompatibilityUnsupported}
        />
      );

      expect(screen.getByText('Text-to-Speech Not Supported')).toBeInTheDocument();
      expect(screen.getByText('This feature is not supported in your browser.')).toBeInTheDocument();
    });

    it('should display feature name correctly', () => {
      render(
        <CompatibilityWarning
          feature="speechSynthesis"
          compatibility={mockCompatibilityUnsupported}
        />
      );

      expect(screen.getByText('Text-to-Speech Not Supported')).toBeInTheDocument();
    });

    it('should handle unknown feature names', () => {
      render(
        <CompatibilityWarning
          feature="unknownFeature"
          compatibility={mockCompatibilityUnsupported}
        />
      );

      expect(screen.getByText('unknownFeature Not Supported')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const { container } = render(
        <CompatibilityWarning
          feature="tts"
          compatibility={mockCompatibilityUnsupported}
          className="custom-class"
        />
      );

      expect(container.firstChild).toHaveClass('custom-class');
    });

    describe('with details', () => {
      it('should show expand/collapse button when showDetails is true and has missing features', () => {
        render(
          <CompatibilityWarning
            feature="tts"
            compatibility={mockCompatibilityUnsupported}
            showDetails={true}
          />
        );

        expect(screen.getByLabelText('Show details')).toBeInTheDocument();
      });

      it('should not show expand/collapse button when no missing features', () => {
        const compatibilityWithoutMissingFeatures: CompatibilityResult = {
          isSupported: false,
          missingFeatures: [],
          fallbackMessage: 'Not supported',
        };

        render(
          <CompatibilityWarning
            feature="tts"
            compatibility={compatibilityWithoutMissingFeatures}
            showDetails={true}
          />
        );

        expect(screen.queryByLabelText('Show details')).not.toBeInTheDocument();
      });

      it('should expand and show missing features when clicked', () => {
        render(
          <CompatibilityWarning
            feature="tts"
            compatibility={mockCompatibilityUnsupported}
            showDetails={true}
          />
        );

        // Initially collapsed
        expect(screen.queryByText('Missing browser features:')).not.toBeInTheDocument();

        // Click to expand
        const expandButton = screen.getByLabelText('Show details');
        fireEvent.click(expandButton);

        // Should show details
        expect(screen.getByText('Missing browser features:')).toBeInTheDocument();
        expect(screen.getByText('Text-to-Speech')).toBeInTheDocument();
        expect(screen.getByText('Web Workers')).toBeInTheDocument();

        // Button should change to collapse
        expect(screen.getByLabelText('Hide details')).toBeInTheDocument();
      });

      it('should collapse when clicked again', () => {
        render(
          <CompatibilityWarning
            feature="tts"
            compatibility={mockCompatibilityUnsupported}
            showDetails={true}
          />
        );

        const expandButton = screen.getByLabelText('Show details');
        
        // Expand
        fireEvent.click(expandButton);
        expect(screen.getByText('Missing browser features:')).toBeInTheDocument();

        // Collapse
        const collapseButton = screen.getByLabelText('Hide details');
        fireEvent.click(collapseButton);
        expect(screen.queryByText('Missing browser features:')).not.toBeInTheDocument();
      });

      it('should not show expand button when showDetails is false', () => {
        render(
          <CompatibilityWarning
            feature="tts"
            compatibility={mockCompatibilityUnsupported}
            showDetails={false}
          />
        );

        expect(screen.queryByLabelText('Show details')).not.toBeInTheDocument();
      });
    });

    describe('accessibility', () => {
      it('should have proper ARIA attributes', () => {
        render(
          <CompatibilityWarning
            feature="tts"
            compatibility={mockCompatibilityUnsupported}
            showDetails={true}
          />
        );

        const expandButton = screen.getByLabelText('Show details');
        expect(expandButton).toHaveAttribute('aria-label', 'Show details');
      });

      it('should be keyboard accessible', () => {
        render(
          <CompatibilityWarning
            feature="tts"
            compatibility={mockCompatibilityUnsupported}
            showDetails={true}
          />
        );

        const expandButton = screen.getByLabelText('Show details');
        
        // Should be focusable
        expandButton.focus();
        expect(document.activeElement).toBe(expandButton);

        // Should respond to Enter key
        fireEvent.keyDown(expandButton, { key: 'Enter' });
        expect(screen.getByText('Missing browser features:')).toBeInTheDocument();
      });
    });
  });

  describe('BrowserUpdatePrompt component', () => {
    it('should render browser update prompt', () => {
      render(<BrowserUpdatePrompt />);

      expect(screen.getByText('Update Your Browser')).toBeInTheDocument();
      expect(screen.getByText(/For the best experience with enhanced content features/)).toBeInTheDocument();
    });

    it('should show recommended browsers', () => {
      render(<BrowserUpdatePrompt />);

      expect(screen.getByText('Recommended browsers:')).toBeInTheDocument();
      expect(screen.getByText('• Chrome 90+')).toBeInTheDocument();
      expect(screen.getByText('• Firefox 88+')).toBeInTheDocument();
      expect(screen.getByText('• Safari 14+')).toBeInTheDocument();
      expect(screen.getByText('• Edge 90+')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const { container } = render(<BrowserUpdatePrompt className="custom-class" />);

      expect(container.firstChild).toHaveClass('custom-class');
    });

    describe('accessibility', () => {
      it('should have proper semantic structure', () => {
        render(<BrowserUpdatePrompt />);

        expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent('Update Your Browser');
      });
    });
  });

  describe('FeatureUnavailable component', () => {
    it('should render feature unavailable message', () => {
      render(
        <FeatureUnavailable
          featureName="Advanced Charts"
          reason="Canvas support is required"
          suggestion="Please update your browser"
        />
      );

      expect(screen.getByText('Advanced Charts Unavailable')).toBeInTheDocument();
      expect(screen.getByText('Canvas support is required')).toBeInTheDocument();
      expect(screen.getByText('Please update your browser')).toBeInTheDocument();
    });

    it('should render without optional props', () => {
      render(<FeatureUnavailable featureName="Test Feature" />);

      expect(screen.getByText('Test Feature Unavailable')).toBeInTheDocument();
      expect(screen.queryByText('Canvas support is required')).not.toBeInTheDocument();
      expect(screen.queryByText('Please update your browser')).not.toBeInTheDocument();
    });

    it('should render with only reason', () => {
      render(
        <FeatureUnavailable
          featureName="Test Feature"
          reason="Not supported"
        />
      );

      expect(screen.getByText('Test Feature Unavailable')).toBeInTheDocument();
      expect(screen.getByText('Not supported')).toBeInTheDocument();
      expect(screen.queryByText('Please update your browser')).not.toBeInTheDocument();
    });

    it('should render with only suggestion', () => {
      render(
        <FeatureUnavailable
          featureName="Test Feature"
          suggestion="Try a different browser"
        />
      );

      expect(screen.getByText('Test Feature Unavailable')).toBeInTheDocument();
      expect(screen.queryByText('Not supported')).not.toBeInTheDocument();
      expect(screen.getByText('Try a different browser')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const { container } = render(
        <FeatureUnavailable
          featureName="Test Feature"
          className="custom-class"
        />
      );

      expect(container.firstChild).toHaveClass('custom-class');
    });

    describe('accessibility', () => {
      it('should have proper semantic structure', () => {
        render(<FeatureUnavailable featureName="Test Feature" />);

        expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent('Test Feature Unavailable');
      });
    });
  });

  describe('visual styling', () => {
    it('should apply correct CSS classes for CompatibilityWarning', () => {
      const { container } = render(
        <CompatibilityWarning
          feature="tts"
          compatibility={mockCompatibilityUnsupported}
        />
      );

      const warning = container.firstChild as HTMLElement;
      expect(warning).toHaveClass('compatibility-warning');
      expect(warning).toHaveClass('bg-yellow-50');
      expect(warning).toHaveClass('border-yellow-200');
    });

    it('should apply correct CSS classes for BrowserUpdatePrompt', () => {
      const { container } = render(<BrowserUpdatePrompt />);

      const prompt = container.firstChild as HTMLElement;
      expect(prompt).toHaveClass('browser-update-prompt');
      expect(prompt).toHaveClass('bg-blue-50');
      expect(prompt).toHaveClass('border-blue-200');
    });

    it('should apply correct CSS classes for FeatureUnavailable', () => {
      const { container } = render(<FeatureUnavailable featureName="Test" />);

      const unavailable = container.firstChild as HTMLElement;
      expect(unavailable).toHaveClass('feature-unavailable');
      expect(unavailable).toHaveClass('bg-gray-50');
      expect(unavailable).toHaveClass('border-gray-200');
    });
  });
});