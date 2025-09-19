/**
 * Efficient date formatter using cached Intl.DateTimeFormat
 * Avoids repeated locale database lookups that occur with toLocaleString()
 */
class DateFormatter {
  private static instance: DateFormatter;
  private formatter: Intl.DateTimeFormat;

  private constructor() {
    // Create a single formatter instance with desired options
    this.formatter = new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  public static getInstance(): DateFormatter {
    if (!DateFormatter.instance) {
      DateFormatter.instance = new DateFormatter();
    }
    return DateFormatter.instance;
  }

  public format(date: Date): string {
    return this.formatter.format(date);
  }

  public formatTimestamp(timestamp: string | null | undefined): string {
    if (!timestamp) {
      return '';
    }

    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) {
        return timestamp;
      }
      return this.format(date);
    } catch (error) {
      console.error('Failed to format timestamp:', error);
      return timestamp;
    }
  }
}

// Export convenience function
export const formatTimestamp = (timestamp: string | null | undefined): string => {
  return DateFormatter.getInstance().formatTimestamp(timestamp);
};

export default DateFormatter;