import React, { useState } from 'react';
import { Calendar } from 'lucide-react';
import { Button, Input, Label } from '@librechat/client';
import { cn } from '~/utils';
import type { TimeRange, TimeRangePreset } from '~/types/admin';

/**
 * TimeRangeSelector component allows users to select predefined or custom date ranges
 * Used in the Admin Dashboard for filtering metrics by time period
 */
const TimeRangeSelector: React.FC<{
  value: TimeRange;
  onChange: (range: TimeRange) => void;
  presets?: TimeRangePreset[];
}> = ({ value, onChange, presets = ['today', 'last7days', 'last30days', 'last90days'] }) => {
  const [showCustom, setShowCustom] = useState(value.preset === 'custom');
  const [customStart, setCustomStart] = useState(
    value.start.toISOString().split('T')[0],
  );
  const [customEnd, setCustomEnd] = useState(
    value.end.toISOString().split('T')[0],
  );

  // Preset button configurations
  const presetConfigs: Record<TimeRangePreset, { label: string; getDates: () => { start: Date; end: Date } }> = {
    today: {
      label: 'Today',
      getDates: () => {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        return { start, end };
      },
    },
    last7days: {
      label: 'Last 7 Days',
      getDates: () => {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 7);
        return { start, end };
      },
    },
    last30days: {
      label: 'Last 30 Days',
      getDates: () => {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 30);
        return { start, end };
      },
    },
    last90days: {
      label: 'Last 90 Days',
      getDates: () => {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 90);
        return { start, end };
      },
    },
    custom: {
      label: 'Custom Range',
      getDates: () => ({ start: new Date(), end: new Date() }),
    },
  };

  const handlePresetClick = (preset: TimeRangePreset) => {
    if (preset === 'custom') {
      setShowCustom(true);
      return;
    }

    setShowCustom(false);
    const dates = presetConfigs[preset].getDates();
    onChange({
      start: dates.start,
      end: dates.end,
      preset,
    });
  };

  const handleCustomApply = () => {
    const start = new Date(customStart);
    const end = new Date(customEnd);

    // Validation: start date must be before or equal to end date
    if (start > end) {
      // Could add error toast here
      return;
    }

    onChange({
      start,
      end,
      preset: 'custom',
    });
  };

  const handleCustomCancel = () => {
    setShowCustom(false);
    // Reset to last non-custom preset or default to last7days
    if (value.preset && value.preset !== 'custom') {
      const dates = presetConfigs[value.preset].getDates();
      onChange({
        start: dates.start,
        end: dates.end,
        preset: value.preset,
      });
    } else {
      handlePresetClick('last7days');
    }
  };

  return (
    <div className="space-y-4">
      {/* Preset Buttons */}
      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => (
          <Button
            key={preset}
            variant={value.preset === preset && !showCustom ? 'default' : 'outline'}
            size="sm"
            onClick={() => handlePresetClick(preset)}
            className={cn(
              'transition-all',
              value.preset === preset && !showCustom && 'ring-2 ring-ring ring-offset-2',
            )}
          >
            {preset === 'custom' && <Calendar className="mr-2 h-4 w-4" />}
            {presetConfigs[preset].label}
          </Button>
        ))}
      </div>

      {/* Custom Date Range Picker */}
      {showCustom && (
        <div className="rounded-lg border border-border-light bg-surface-secondary p-4">
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Start Date */}
              <div className="space-y-2">
                <Label htmlFor="start-date" className="text-sm font-medium">
                  Start Date
                </Label>
                <Input
                  id="start-date"
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  max={customEnd}
                  className="w-full"
                />
              </div>

              {/* End Date */}
              <div className="space-y-2">
                <Label htmlFor="end-date" className="text-sm font-medium">
                  End Date
                </Label>
                <Input
                  id="end-date"
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  min={customStart}
                  max={new Date().toISOString().split('T')[0]}
                  className="w-full"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={handleCustomCancel}>
                Cancel
              </Button>
              <Button variant="default" size="sm" onClick={handleCustomApply}>
                Apply
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TimeRangeSelector;
