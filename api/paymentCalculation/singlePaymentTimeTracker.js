const singlePaymentTimeTracker = () => {
  const startTime = new Date();

  // Assuming the end time is set to one month after the start time
  const endTime = new Date(startTime);
  endTime.setMonth(startTime.getMonth() + 1);

  return {
    startTime,
    endTime
  };
};

module.exports = singlePaymentTimeTracker;
