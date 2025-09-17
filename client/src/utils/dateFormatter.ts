class DateFormatter {
  private static instance: DateFormatter;
  private formatter: Intl.DateTimeFormat;

  private constructor() {
    this.formatter = new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit', // Display seconds so users can see latency
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

export const formatTimestamp = (timestamp: string | null | undefined): string => {
  return DateFormatter.getInstance().formatTimestamp(timestamp);
};

export default DateFormatter;
