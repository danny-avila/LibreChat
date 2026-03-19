import React, { useState, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  minDate?: string;
  maxDate?: string;
  required?: boolean;
  disabled?: boolean;
}

const DateRangePicker: React.FC<DateRangePickerProps> = ({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  required = false,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [internalStartDate, setInternalStartDate] = useState<Date | null>(null);
  const [internalEndDate, setInternalEndDate] = useState<Date | null>(null);
  const [leftMonth, setLeftMonth] = useState(new Date());
  const [rightMonth, setRightMonth] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth() + 1),
  );
  const [hoverDate, setHoverDate] = useState<Date | null>(null);
  const [showMonthPicker, setShowMonthPicker] = useState<'left' | 'right' | null>(null);
  const [showYearPicker, setShowYearPicker] = useState<'left' | 'right' | null>(null);

  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const daysOfWeek = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  // Convert string dates to Date objects on mount
  useEffect(() => {
    if (startDate) {
      setInternalStartDate(new Date(startDate + 'T00:00:00'));
    }
    if (endDate) {
      setInternalEndDate(new Date(endDate + 'T00:00:00'));
    }
  }, [startDate, endDate]);

  const formatDateToString = (date: Date | null): string => {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatDate = (date: Date | null) => {
    if (!date) return '';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    return { daysInMonth, startingDayOfWeek };
  };

  const isDateInRange = (date: Date) => {
    if (!internalStartDate || !internalEndDate) return false;
    return date >= internalStartDate && date <= internalEndDate;
  };

  const isDateInHoverRange = (date: Date) => {
    if (!internalStartDate || !hoverDate || internalEndDate) return false;
    const rangeStart = internalStartDate < hoverDate ? internalStartDate : hoverDate;
    const rangeEnd = internalStartDate < hoverDate ? hoverDate : internalStartDate;
    return date >= rangeStart && date <= rangeEnd;
  };

  const handleDateClick = (day: number, monthDate: Date) => {
    const selectedDate = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Don't allow selecting future dates
    if (selectedDate > today) return;

    if (!internalStartDate || (internalStartDate && internalEndDate)) {
      setInternalStartDate(selectedDate);
      setInternalEndDate(null);
    } else {
      if (selectedDate < internalStartDate) {
        setInternalEndDate(internalStartDate);
        setInternalStartDate(selectedDate);
      } else {
        setInternalEndDate(selectedDate);
      }
    }
  };

  const handlePrevMonth = () => {
    setLeftMonth(new Date(leftMonth.getFullYear(), leftMonth.getMonth() - 1));
    setRightMonth(new Date(rightMonth.getFullYear(), rightMonth.getMonth() - 1));
  };

  const handleNextMonth = () => {
    setLeftMonth(new Date(leftMonth.getFullYear(), leftMonth.getMonth() + 1));
    setRightMonth(new Date(rightMonth.getFullYear(), rightMonth.getMonth() + 1));
  };

  const handleMonthSelect = (monthIndex: number, side: 'left' | 'right') => {
    if (side === 'left') {
      setLeftMonth(new Date(leftMonth.getFullYear(), monthIndex));
    } else {
      setRightMonth(new Date(rightMonth.getFullYear(), monthIndex));
    }
    setShowMonthPicker(null);
  };

  const handleYearSelect = (year: number, side: 'left' | 'right') => {
    if (side === 'left') {
      setLeftMonth(new Date(year, leftMonth.getMonth()));
    } else {
      setRightMonth(new Date(year, rightMonth.getMonth()));
    }
    setShowYearPicker(null);
  };

  const getYearRange = () => {
    const currentYear = new Date().getFullYear();
    const years: number[] = [];
    for (let i = currentYear - 100; i <= currentYear; i++) {
      years.push(i);
    }
    return years;
  };

  const clearDates = () => {
    setInternalStartDate(null);
    setInternalEndDate(null);
    onStartDateChange('');
    onEndDateChange('');
  };

  const applyDates = () => {
    if (internalStartDate) {
      onStartDateChange(formatDateToString(internalStartDate));
    }
    if (internalEndDate) {
      onEndDateChange(formatDateToString(internalEndDate));
    }
    setIsOpen(false);
  };

  const renderCalendar = (monthDate: Date) => {
    const { daysInMonth, startingDayOfWeek } = getDaysInMonth(monthDate);
    const days: React.ReactNode[] = [];

    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(<div key={`empty-${i}`} className="h-9" />);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const isFuture = date > today;
      const isStart = internalStartDate && date.toDateString() === internalStartDate.toDateString();
      const isEnd = internalEndDate && date.toDateString() === internalEndDate.toDateString();
      const isInRange = isDateInRange(date);
      const isInHover = isDateInHoverRange(date);
      const isToday = date.toDateString() === new Date().toDateString();

      days.push(
        <button
          key={day}
          type="button"
          onClick={() => handleDateClick(day, monthDate)}
          onMouseEnter={() => !isFuture && setHoverDate(date)}
          disabled={isFuture}
          className={`flex h-9 w-9 items-center justify-center rounded-lg text-sm transition-colors ${isFuture ? 'cursor-not-allowed text-gray-400 dark:text-gray-600' : ''} ${isStart || isEnd ? 'bg-blue-600 font-semibold text-white' : ''} ${isInRange && !isStart && !isEnd ? 'bg-blue-100 text-blue-900 dark:bg-blue-900/30 dark:text-blue-200' : ''} ${isInHover && !isStart && !isInRange ? 'bg-blue-50 dark:bg-blue-900/20' : ''} ${!isStart && !isEnd && !isInRange && !isInHover && !isFuture ? 'text-gray-800 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700' : ''} ${isToday && !isStart && !isEnd ? 'border-2 border-blue-600' : ''} `}
        >
          {day}
        </button>,
      );
    }

    return days;
  };

  const renderMonth = (monthDate: Date, side: 'left' | 'right') => (
    <div className="flex-1">
      <div className="mb-3 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => {
            setShowMonthPicker(side);
            setShowYearPicker(null);
          }}
          className="rounded-lg px-3 py-1 font-semibold text-gray-800 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          {months[monthDate.getMonth()]}
        </button>
        <button
          type="button"
          onClick={() => {
            setShowYearPicker(side);
            setShowMonthPicker(null);
          }}
          className="rounded-lg px-3 py-1 font-semibold text-gray-800 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          {monthDate.getFullYear()}
        </button>
      </div>

      {showMonthPicker === side ? (
        <div className="grid grid-cols-3 gap-2 p-2">
          {months.map((month, index) => (
            <button
              key={month}
              type="button"
              onClick={() => handleMonthSelect(index, side)}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${monthDate.getMonth() === index ? 'bg-blue-600 text-white' : 'text-gray-800 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700'} `}
            >
              {month.slice(0, 3)}
            </button>
          ))}
        </div>
      ) : showYearPicker === side ? (
        <div className="h-64 overflow-y-auto">
          <div className="grid grid-cols-3 gap-2 p-2">
            {getYearRange().map((year) => (
              <button
                key={year}
                type="button"
                onClick={() => handleYearSelect(year, side)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${monthDate.getFullYear() === year ? 'bg-blue-600 text-white' : 'text-gray-800 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700'} `}
              >
                {year}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="mb-2 grid grid-cols-7 gap-1">
            {daysOfWeek.map((day) => (
              <div
                key={day}
                className="flex h-9 items-center justify-center text-xs font-semibold text-gray-600 dark:text-gray-400"
              >
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">{renderCalendar(monthDate)}</div>
        </>
      )}
    </div>
  );

  return (
    <div className="relative">
      <div className="mb-2">
        <span className="text-sm font-medium text-white">Date Range</span>
        <p className="text-xs text-gray-400">Select the time period for keyword data</p>
      </div>

      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`flex items-center justify-between rounded-lg border-2 border-gray-600 bg-gray-700 px-4 py-3 transition-colors ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:border-blue-500'} `}
      >
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-gray-400" />
          <span className="text-gray-200">
            {internalStartDate && internalEndDate
              ? `${formatDate(internalStartDate)} - ${formatDate(internalEndDate)}`
              : internalStartDate
                ? formatDate(internalStartDate)
                : 'Select date range'}
          </span>
        </div>
        {(internalStartDate || internalEndDate) && !disabled && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              clearDates();
            }}
            className="rounded p-1 hover:bg-gray-600"
          >
            <X className="h-4 w-4 text-gray-400" />
          </button>
        )}
      </div>

      {isOpen && !disabled && (
        <div className="absolute top-full z-50 mt-2 w-max rounded-lg border-2 border-gray-200 bg-white p-5 shadow-xl dark:border-gray-600 dark:bg-gray-800">
          <div className="mb-4 flex items-center justify-between">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <ChevronLeft className="h-5 w-5 text-gray-800 dark:text-gray-200" />
            </button>
            <div className="flex-1" />
            <button
              type="button"
              onClick={handleNextMonth}
              className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <ChevronRight className="h-5 w-5 text-gray-800 dark:text-gray-200" />
            </button>
          </div>

          <div className="flex gap-8" onMouseLeave={() => setHoverDate(null)}>
            {renderMonth(leftMonth, 'left')}
            <div className="w-px bg-gray-200 dark:bg-gray-600" />
            {renderMonth(rightMonth, 'right')}
          </div>

          <div className="mt-5 flex items-center justify-between border-t border-gray-200 pt-4 dark:border-gray-600">
            <button
              type="button"
              onClick={clearDates}
              className="text-sm text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={applyDates}
              disabled={!internalStartDate || !internalEndDate}
              className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Apply
            </button>
          </div>
        </div>
      )}

      {/* Validation message */}
      {startDate && endDate && startDate > endDate && (
        <p className="mt-2 text-xs text-red-400">End date must be on or after start date</p>
      )}
    </div>
  );
};

export default DateRangePicker;
