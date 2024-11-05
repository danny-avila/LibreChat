import React from 'react';
import { OGDialog, OGDialogContent, OGDialogHeader, OGDialogTitle } from '~/components';
import { useLocalize } from '~/hooks';
import { useGetPaymentHistory } from 'librechat-data-provider/react-query';

interface PaymentHistoryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PaymentHistory: React.FC<PaymentHistoryProps> = ({ open, onOpenChange }) => {
  const localize = useLocalize();
  const { data: paymentHistory = [], isLoading, error } = useGetPaymentHistory();

  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogContent title={localize('com_nav_payment_history')} className="w-full max-w-2xl mx-auto overflow-y-auto bg-background text-text-primary shadow-2xl rounded-lg">
        <OGDialogHeader>
          <OGDialogTitle>{localize('com_nav_payment_history')}</OGDialogTitle>
        </OGDialogHeader>

        {isLoading ? (
          <p className="text-center py-6">{localize('com_nav_loading')}</p>
        ) : error ? (
          <p className="text-center text-red-600 py-6">{localize('com_nav_error_loading_history')}</p>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <div className="p-4 max-h-[60vh] overflow-y-auto">
              <h5 className="text-lg font-bold text-gray-700 dark:text-gray-300 mb-4">
                {localize('com_nav_payment_records')}
              </h5>
              <ul className="space-y-4">
                {paymentHistory?.payments?.length === 0 ? (
                  <p className="text-center text-gray-600 dark:text-gray-400">
                    {localize('com_nav_no_payment_records')}
                  </p>
                ) : (
                  paymentHistory.payments.map((record) => (
                    <li
                      key={record.transactionId}
                      className="flex flex-col gap-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg shadow-sm"
                    >
                      <div className="flex flex-col sm:flex-row sm:justify-between gap-2">
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {localize('com_nav_payment_date')}: {new Date(record.paymentDate).toLocaleDateString()}
                        </p>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {localize('com_nav_payment_amount')}: {record.amount.toLocaleString()} تومان
                        </p>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:justify-between gap-2">
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {localize('com_nav_provider')}: {record.provider}
                        </p>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {localize('com_nav_status')}:
                          <span className={`ml-1 font-semibold ${record.status === 'paid' ? 'text-green-500' : record.status === 'failed' ? 'text-red-500' : 'text-red-500'}`}>
                            {record.status === 'paid'
                              ? localize('com_nav_status_successful')
                              : record.status === 'failed'
                                ? localize('com_nav_status_failed')
                                : localize('com_nav_status_failed')}
                          </span>
                        </p>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:justify-between gap-2">
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {localize('com_nav_reference_id')}: {record.transactionId}
                        </p>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        )}
      </OGDialogContent>
    </OGDialog>
  );
};

export default PaymentHistory;
