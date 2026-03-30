import { useState, useEffect } from 'react';
import {
  Save,
  X,
  ToggleLeft,
  ToggleRight,
  Clock,
  Calendar,
  CalendarDays,
  AlertTriangle,
} from 'lucide-react';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@librechat/client';
import type { TimeWindow, CreateTimeWindowRequest, UpdateTimeWindowRequest } from './types';

interface TimeWindowFormProps {
  timeWindow?: TimeWindow;
  isEditing?: boolean;
  onSave: (data: CreateTimeWindowRequest | UpdateTimeWindowRequest) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday', short: 'Sun' },
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
  { value: 6, label: 'Saturday', short: 'Sat' },
];

const COMMON_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Australia/Sydney',
];

export default function TimeWindowForm({
  timeWindow,
  isEditing = false,
  onSave,
  onCancel,
  isLoading = false,
}: TimeWindowFormProps) {
  const [formData, setFormData] = useState<CreateTimeWindowRequest>({
    name: '',
    windowType: 'daily',
    startTime: '09:00',
    endTime: '17:00',
    daysOfWeek: [1, 2, 3, 4, 5], // Monday to Friday by default
    startDate: '',
    endDate: '',
    timezone: 'UTC',
    isActive: true,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Load time window data for editing
  useEffect(() => {
    if (isEditing && timeWindow) {
      setFormData({
        name: timeWindow.name,
        windowType: timeWindow.windowType,
        startTime: timeWindow.startTime || '09:00',
        endTime: timeWindow.endTime || '17:00',
        daysOfWeek: timeWindow.daysOfWeek || [],
        startDate: timeWindow.startDate
          ? new Date(timeWindow.startDate).toISOString().split('T')[0]
          : '',
        endDate: timeWindow.endDate ? new Date(timeWindow.endDate).toISOString().split('T')[0] : '',
        timezone: timeWindow.timezone || 'UTC',
        isActive: timeWindow.isActive,
      });
    }
  }, [isEditing, timeWindow]);

  const handleInputChange = (field: keyof CreateTimeWindowRequest, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));

    // Clear error when user starts typing
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  const handleDayToggle = (dayValue: number) => {
    setFormData((prev) => ({
      ...prev,
      daysOfWeek: prev.daysOfWeek?.includes(dayValue)
        ? prev.daysOfWeek.filter((d) => d !== dayValue)
        : [...(prev.daysOfWeek || []), dayValue].sort(),
    }));
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name?.trim()) {
      newErrors.name = 'Time window name is required';
    } else if (formData.name.length > 100) {
      newErrors.name = 'Name must be less than 100 characters';
    }

    if (formData.windowType === 'daily' || formData.windowType === 'weekly') {
      if (!formData.startTime) {
        newErrors.startTime = 'Start time is required';
      }
      if (!formData.endTime) {
        newErrors.endTime = 'End time is required';
      }
      if (formData.startTime && formData.endTime && formData.startTime >= formData.endTime) {
        newErrors.endTime = 'End time must be after start time';
      }

      if (
        formData.windowType === 'weekly' &&
        (!formData.daysOfWeek || formData.daysOfWeek.length === 0)
      ) {
        newErrors.daysOfWeek = 'At least one day must be selected for weekly windows';
      }
    }

    if (formData.windowType === 'date_range') {
      if (!formData.startDate) {
        newErrors.startDate = 'Start date is required';
      }
      if (!formData.endDate) {
        newErrors.endDate = 'End date is required';
      }
      if (formData.startDate && formData.endDate && formData.startDate > formData.endDate) {
        newErrors.endDate = 'End date must be after start date';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    // Clean up data based on window type
    const submitData = { ...formData };

    if (submitData.windowType === 'daily') {
      submitData.daysOfWeek = undefined;
      submitData.startDate = undefined;
      submitData.endDate = undefined;
    } else if (submitData.windowType === 'weekly') {
      submitData.startDate = undefined;
      submitData.endDate = undefined;
    } else if (submitData.windowType === 'date_range') {
      submitData.startTime = undefined;
      submitData.endTime = undefined;
      submitData.daysOfWeek = undefined;
    } else if (submitData.windowType === 'exception') {
      submitData.startTime = undefined;
      submitData.endTime = undefined;
      submitData.daysOfWeek = undefined;
    }

    onSave(submitData);
  };

  const getWindowTypeIcon = (type: string) => {
    switch (type) {
      case 'daily':
        return <Clock className="h-4 w-4" />;
      case 'weekly':
        return <CalendarDays className="h-4 w-4" />;
      case 'date_range':
        return <Calendar className="h-4 w-4" />;
      case 'exception':
        return <AlertTriangle className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Name */}
      <div className="space-y-2">
        <Label htmlFor="name" className="text-sm font-medium text-text-primary">
          Time Window Name *
        </Label>
        <Input
          id="name"
          type="text"
          value={formData.name}
          onChange={(e) => handleInputChange('name', e.target.value)}
          placeholder="Enter time window name..."
          className={errors.name ? 'border-red-500 dark:border-red-400' : ''}
          disabled={isLoading}
        />
        {errors.name && <p className="text-sm text-red-500 dark:text-red-400">{errors.name}</p>}
      </div>

      {/* Window Type */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-text-primary">Window Type *</Label>
        <Select
          value={formData.windowType}
          onValueChange={(value) => handleInputChange('windowType', value)}
        >
          <SelectTrigger className="w-full" data-testid="window-type-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="!bg-white dark:!bg-gray-800 !text-black dark:!text-white [&>*]:!text-black [&>*]:dark:!text-white">
            <SelectItem value="daily" className="!text-black dark:!text-white">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Daily - Same time every day
              </div>
            </SelectItem>
            <SelectItem value="weekly" className="!text-black dark:!text-white">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4" />
                Weekly - Specific days of the week
              </div>
            </SelectItem>
            <SelectItem value="date_range" className="!text-black dark:!text-white">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Date Range - Specific date period
              </div>
            </SelectItem>
            <SelectItem value="exception" className="!text-black dark:!text-white">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Exception - Block access on specific dates
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Time Fields (for daily and weekly) */}
      {(formData.windowType === 'daily' || formData.windowType === 'weekly') && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="startTime" className="text-sm font-medium text-text-primary">
              Start Time *
            </Label>
            <Input
              id="startTime"
              type="time"
              value={formData.startTime}
              onChange={(e) => handleInputChange('startTime', e.target.value)}
              className={errors.startTime ? 'border-red-500 dark:border-red-400' : ''}
              disabled={isLoading}
            />
            {errors.startTime && <p className="text-sm text-red-500 dark:text-red-400">{errors.startTime}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="endTime" className="text-sm font-medium text-text-primary">
              End Time *
            </Label>
            <Input
              id="endTime"
              type="time"
              value={formData.endTime}
              onChange={(e) => handleInputChange('endTime', e.target.value)}
              className={errors.endTime ? 'border-red-500 dark:border-red-400' : ''}
              disabled={isLoading}
            />
            {errors.endTime && <p className="text-sm text-red-500 dark:text-red-400">{errors.endTime}</p>}
          </div>
        </div>
      )}

      {/* Days of Week (for weekly) */}
      {formData.windowType === 'weekly' && (
        <div className="space-y-2">
          <Label className="text-sm font-medium text-text-primary">Days of Week *</Label>
          <div className="flex flex-wrap gap-2">
            {DAYS_OF_WEEK.map((day) => (
              <Button
                key={day.value}
                type="button"
                variant={formData.daysOfWeek?.includes(day.value) ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleDayToggle(day.value)}
                disabled={isLoading}
                className="text-xs"
              >
                {day.short}
              </Button>
            ))}
          </div>
          {errors.daysOfWeek && <p className="text-sm text-red-500 dark:text-red-400">{errors.daysOfWeek}</p>}
        </div>
      )}

      {/* Date Range (for date_range and exception) */}
      {(formData.windowType === 'date_range' || formData.windowType === 'exception') && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="startDate" className="text-sm font-medium text-text-primary">
              Start Date *
            </Label>
            <Input
              id="startDate"
              type="date"
              value={formData.startDate}
              onChange={(e) => handleInputChange('startDate', e.target.value)}
              className={errors.startDate ? 'border-red-500 dark:border-red-400' : ''}
              disabled={isLoading}
            />
            {errors.startDate && <p className="text-sm text-red-500 dark:text-red-400">{errors.startDate}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="endDate" className="text-sm font-medium text-text-primary">
              End Date *
            </Label>
            <Input
              id="endDate"
              type="date"
              value={formData.endDate}
              onChange={(e) => handleInputChange('endDate', e.target.value)}
              className={errors.endDate ? 'border-red-500 dark:border-red-400' : ''}
              disabled={isLoading}
            />
            {errors.endDate && <p className="text-sm text-red-500 dark:text-red-400">{errors.endDate}</p>}
          </div>
        </div>
      )}

      {/* Timezone */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-text-primary">Timezone</Label>
        <Select
          value={formData.timezone}
          onValueChange={(value) => handleInputChange('timezone', value)}
        >
          <SelectTrigger className="w-full" data-testid="timezone-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="!bg-white dark:!bg-gray-800 !text-black dark:!text-white [&>*]:!text-black [&>*]:dark:!text-white">
            {COMMON_TIMEZONES.map((tz) => (
              <SelectItem key={tz} value={tz} className="!text-black dark:!text-white">
                {tz}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Active Status */}
      <div className="flex items-center space-x-3">
        <button
          type="button"
          onClick={() => handleInputChange('isActive', !formData.isActive)}
          className="flex items-center gap-2 focus:outline-none"
          disabled={isLoading}
        >
          {formData.isActive ? (
            <ToggleRight className="h-6 w-6 text-blue-500 dark:text-blue-400" />
          ) : (
            <ToggleLeft className="h-6 w-6 text-gray-400 dark:text-gray-500" />
          )}
          <div className="text-left">
            <div className="text-sm font-medium text-text-primary">Window Active</div>
            <div className="text-xs text-text-secondary">
              {formData.isActive ? 'This time window is active' : 'This time window is disabled'}
            </div>
          </div>
        </button>
      </div>

      {/* Submit Buttons */}
      <div className="flex gap-3 pt-4">
        <Button type="submit" disabled={isLoading} className="flex items-center gap-2">
          <Save className="h-4 w-4" />
          {isLoading ? 'Saving...' : isEditing ? 'Update Window' : 'Create Window'}
        </Button>

        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isLoading}
          className="flex items-center gap-2"
        >
          <X className="h-4 w-4" />
          Cancel
        </Button>
      </div>
    </form>
  );
}
