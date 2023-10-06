import { Dialog, Label } from '~/components/ui/';
import DialogTemplate from '~/components/ui/DialogTemplate';

export default function ErrorDialog({ message }) {
  const title = 'Insufficient Funds';
  const callToAction = () => {
    console.log('callToAction');
  };
  return (
    <Dialog defaultOpen={true}>
      <DialogTemplate
        title={title}
        className="max-w-[450px]"
        main={
          <>
            <div className="flex w-full flex-col items-center gap-2">
              <div className="grid w-full items-center gap-2">
                <Label htmlFor="chatGptLabel" className="text-left text-sm font-medium">
                  {message}
                </Label>
              </div>
            </div>
          </>
        }
        selection={{
          selectHandler: callToAction,
          selectClasses: 'bg-green-600 hover:bg-green-700 dark:hover:bg-green-800 text-white',
          selectText: 'Purchase Credits',
        }}
      />
    </Dialog>
  );
}
