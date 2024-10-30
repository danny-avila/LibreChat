import { FileSources, FileContext } from 'librechat-data-provider';
import type { TFile } from 'librechat-data-provider';
import { OGDialog, OGDialogContent, OGDialogHeader, OGDialogTitle } from '~/components';
import { useGetFiles } from '~/data-provider';
import { DataTable, columns } from '../Chat/Input/Files/Table';
import { useLocalize } from '~/hooks';
import SubscriptionDataTable from '~/components/Nav/SubscriptionDataTable';

// Sample pricing plans for selection
const pricingPlans = [
  {
    name: 'بیسیک',
    price: '۱ ملیون تومان/ماهیانه',
    description: 'مناسب برای کار های روزمره',
    features: [
      'تک پروژه',
      'صد سوال در ساعت',
      'آپلود فایل تا ده فایل',
      'پشتیبانی ۲۴ ساعته',
    ],
    buttonLabel: 'بسته شما',
  },
  {
    name: 'استاندارد',
    price: '۱.۶ ملیون تومان/ماهیانه',
    description: 'برای رشد و یادگیری',
    features: [
      '۱۰ تا پروژه',
      'پشتیباتی و آموزش پرامپت نویسی ',
      'مدل های ترین شده و آماده',
      'پشتیبانی ۲۴ ساعته',
    ],
    buttonLabel: 'خرید بسته',
  },
  {
    name: 'پیشرفته کیو استار',
    price: '۲.۵ ملیون تومان/ماهیانه',
    description: 'برای توسعه و عملیاتی',
    features: [
      '۱۰۰۰ تا پروژه',
      'پشتیباتی و آموزش پرامپت نویسی ',
      'مدل های ترین شده و آماده',
      'پشتیبانی ۲۴ ساعته',
    ],
    buttonLabel: 'خرید بسته',
  },
];

export default function SubscriptionView({ open, onOpenChange }) {
  const localize = useLocalize();

  // Fetching the user's files data with context and filter adjustments
  const { data: files = [] } = useGetFiles<TFile[]>({
    select: (files) =>
      files.map((file) => ({
        ...file,
        context: file.context ?? FileContext.unknown,
        filterSource: file.source === FileSources.firebase ? FileSources.local : file.source,
      })),
  });

  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogContent
        title={localize('com_nav_subscription')}
        className="w-11/12 overflow-x-auto bg-background text-text-primary shadow-2xl rtl:mr-1"
      >
        <OGDialogHeader>
          <OGDialogTitle>{localize('com_nav_subscription')}</OGDialogTitle>
        </OGDialogHeader>

        {/* User Subscription Data */}
        <div className="mb-8">
          <h3 className="text-2xl font-bold text-center mb-4 text-blue-600 dark:text-blue-400">
            {localize('com_nav_your_subscription')}
          </h3>
          <p className="text-center text-gray-600 dark:text-gray-300 mb-6">
            {localize('com_nav_your_files')}
          </p>
          {/* Displaying user's file data */}
        </div>

        {/* Subscription Plans with User's Current Subscription */}
        <SubscriptionDataTable plans={pricingPlans} />
      </OGDialogContent>
    </OGDialog>
  );
}
