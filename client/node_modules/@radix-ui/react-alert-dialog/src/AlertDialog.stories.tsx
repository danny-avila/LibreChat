import * as React from 'react';
import { css } from '../../../../stitches.config';
import * as AlertDialog from '@radix-ui/react-alert-dialog';

export default { title: 'Components/AlertDialog' };

export const Styled = () => (
  <AlertDialog.Root>
    <AlertDialog.Trigger className={triggerClass()}>delete everything</AlertDialog.Trigger>
    <AlertDialog.Portal>
      <AlertDialog.Overlay className={overlayClass()} />
      <AlertDialog.Content className={contentClass()}>
        <AlertDialog.Title className={titleClass()}>Are you sure?</AlertDialog.Title>
        <AlertDialog.Description className={descriptionClass()}>
          This will do a very dangerous thing. Thar be dragons!
        </AlertDialog.Description>
        <AlertDialog.Action className={actionClass()}>yolo, do it</AlertDialog.Action>
        <AlertDialog.Cancel className={cancelClass()}>maybe not</AlertDialog.Cancel>
      </AlertDialog.Content>
    </AlertDialog.Portal>
  </AlertDialog.Root>
);

export const Controlled = () => {
  const [open, setOpen] = React.useState(false);
  const [housePurchased, setHousePurchased] = React.useState(false);

  return (
    <div>
      <div>
        <img src="https://i.ibb.co/K54hsKt/house.jpg" alt="a large white house with a red roof" />
      </div>
      <AlertDialog.Root open={open} onOpenChange={setOpen}>
        <AlertDialog.Trigger
          onClick={(e) => {
            if (housePurchased) {
              e.preventDefault();
              setHousePurchased(false);
            }
          }}
        >
          {housePurchased ? 'You bought the house! Sell it!' : 'Buy this house'}
        </AlertDialog.Trigger>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className={overlayClass()} />
          <AlertDialog.Content className={contentClass()}>
            <AlertDialog.Title>Are you sure?</AlertDialog.Title>
            <AlertDialog.Description>
              Houses are very expensive and it looks like you only have €20 in the bank. Maybe
              consult with a financial advisor?
            </AlertDialog.Description>
            <AlertDialog.Action className={actionClass()} onClick={() => setHousePurchased(true)}>
              buy it anyway
            </AlertDialog.Action>
            <AlertDialog.Cancel className={cancelClass()}>
              good point, I'll reconsider
            </AlertDialog.Cancel>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
};

export const Chromatic = () => (
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gridTemplateRows: 'repeat(2, 1fr)',
      height: '100vh',
    }}
  >
    <div>
      <h1>Uncontrolled</h1>
      <h2>Closed</h2>
      <AlertDialog.Root>
        <AlertDialog.Trigger className={triggerClass()}>delete everything</AlertDialog.Trigger>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className={overlayClass()} />
          <AlertDialog.Content className={chromaticContentClass()}>
            <AlertDialog.Title className={titleClass()}>Title</AlertDialog.Title>
            <AlertDialog.Description className={descriptionClass()}>
              Description
            </AlertDialog.Description>
            <AlertDialog.Action className={actionClass()}>Confirm</AlertDialog.Action>
            <AlertDialog.Cancel className={cancelClass()}>Cancel</AlertDialog.Cancel>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>

      <h2>Open</h2>
      <AlertDialog.Root defaultOpen>
        <AlertDialog.Trigger className={triggerClass()}>delete everything</AlertDialog.Trigger>
        <AlertDialog.Portal>
          <AlertDialog.Overlay
            className={overlayClass()}
            style={{ left: 0, bottom: '50%', width: '25%' }}
          />
          <AlertDialog.Content
            className={chromaticContentClass()}
            style={{ top: '25%', left: '12%' }}
          >
            <AlertDialog.Title className={titleClass()}>Title</AlertDialog.Title>
            <AlertDialog.Description className={descriptionClass()}>
              Description
            </AlertDialog.Description>
            <AlertDialog.Action className={actionClass()}>Confirm</AlertDialog.Action>
            <AlertDialog.Cancel className={cancelClass()}>Cancel</AlertDialog.Cancel>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>

    <div>
      <h1>Uncontrolled with reordered parts</h1>
      <h2>Closed</h2>
      <AlertDialog.Root>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className={overlayClass()} />
          <AlertDialog.Content className={chromaticContentClass()}>
            <AlertDialog.Title className={titleClass()}>Title</AlertDialog.Title>
            <AlertDialog.Description className={descriptionClass()}>
              Description
            </AlertDialog.Description>
            <AlertDialog.Action className={actionClass()}>Confirm</AlertDialog.Action>
            <AlertDialog.Cancel className={cancelClass()}>Cancel</AlertDialog.Cancel>
          </AlertDialog.Content>
        </AlertDialog.Portal>
        <AlertDialog.Trigger className={triggerClass()}>delete everything</AlertDialog.Trigger>
      </AlertDialog.Root>

      <h2>Open</h2>
      <AlertDialog.Root defaultOpen>
        <AlertDialog.Portal>
          <AlertDialog.Overlay
            className={overlayClass()}
            style={{ left: '25%', bottom: '50%', width: '25%' }}
          />
          <AlertDialog.Content
            className={chromaticContentClass()}
            style={{ top: '25%', left: '37%' }}
          >
            <AlertDialog.Title className={titleClass()}>Title</AlertDialog.Title>
            <AlertDialog.Description className={descriptionClass()}>
              Description
            </AlertDialog.Description>
            <AlertDialog.Action className={actionClass()}>Confirm</AlertDialog.Action>
            <AlertDialog.Cancel className={cancelClass()}>Cancel</AlertDialog.Cancel>
          </AlertDialog.Content>
        </AlertDialog.Portal>
        <AlertDialog.Trigger className={triggerClass()}>delete everything</AlertDialog.Trigger>
      </AlertDialog.Root>
    </div>

    <div>
      <h1>Controlled</h1>
      <h2>Closed</h2>
      <AlertDialog.Root open={false}>
        <AlertDialog.Trigger className={triggerClass()}>delete everything</AlertDialog.Trigger>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className={overlayClass()} />
          <AlertDialog.Content className={chromaticContentClass()}>
            <AlertDialog.Title className={titleClass()}>Title</AlertDialog.Title>
            <AlertDialog.Description className={descriptionClass()}>
              Description
            </AlertDialog.Description>
            <AlertDialog.Action className={actionClass()}>Confirm</AlertDialog.Action>
            <AlertDialog.Cancel className={cancelClass()}>Cancel</AlertDialog.Cancel>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>

      <h2>Open</h2>
      <AlertDialog.Root open>
        <AlertDialog.Trigger className={triggerClass()}>delete everything</AlertDialog.Trigger>
        <AlertDialog.Portal>
          <AlertDialog.Overlay
            className={overlayClass()}
            style={{ left: '50%', bottom: '50%', width: '25%' }}
          />
          <AlertDialog.Content
            className={chromaticContentClass()}
            style={{ top: '25%', left: '62%' }}
          >
            <AlertDialog.Title className={titleClass()}>Title</AlertDialog.Title>
            <AlertDialog.Description className={descriptionClass()}>
              Description
            </AlertDialog.Description>
            <AlertDialog.Action className={actionClass()}>Confirm</AlertDialog.Action>
            <AlertDialog.Cancel className={cancelClass()}>Cancel</AlertDialog.Cancel>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>

    <div>
      <h1>Controlled with reordered parts</h1>
      <h2>Closed</h2>
      <AlertDialog.Root open={false}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className={overlayClass()} />
          <AlertDialog.Content className={chromaticContentClass()}>
            <AlertDialog.Title className={titleClass()}>Title</AlertDialog.Title>
            <AlertDialog.Description className={descriptionClass()}>
              Description
            </AlertDialog.Description>
            <AlertDialog.Action className={actionClass()}>Confirm</AlertDialog.Action>
            <AlertDialog.Cancel className={cancelClass()}>Cancel</AlertDialog.Cancel>
          </AlertDialog.Content>
        </AlertDialog.Portal>
        <AlertDialog.Trigger className={triggerClass()}>delete everything</AlertDialog.Trigger>
      </AlertDialog.Root>

      <h2>Open</h2>
      <AlertDialog.Root open>
        <AlertDialog.Portal>
          <AlertDialog.Overlay
            className={overlayClass()}
            style={{ left: '75%', bottom: '50%', width: '25%' }}
          />
          <AlertDialog.Content
            className={chromaticContentClass()}
            style={{ top: '25%', left: '88%' }}
          >
            <AlertDialog.Title className={titleClass()}>Title</AlertDialog.Title>
            <AlertDialog.Description className={descriptionClass()}>
              Description
            </AlertDialog.Description>
            <AlertDialog.Action className={actionClass()}>Confirm</AlertDialog.Action>
            <AlertDialog.Cancel className={cancelClass()}>Cancel</AlertDialog.Cancel>
          </AlertDialog.Content>
        </AlertDialog.Portal>
        <AlertDialog.Trigger className={triggerClass()}>delete everything</AlertDialog.Trigger>
      </AlertDialog.Root>
    </div>

    <div>
      <h1>State attributes</h1>
      <h2>Closed</h2>
      <AlertDialog.Root>
        <AlertDialog.Trigger className={triggerAttrClass()}>delete everything</AlertDialog.Trigger>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className={overlayAttrClass()} />
          <AlertDialog.Content className={contentAttrClass()}>
            <AlertDialog.Title className={titleAttrClass()}>Title</AlertDialog.Title>
            <AlertDialog.Description className={descriptionAttrClass()}>
              Description
            </AlertDialog.Description>
            <AlertDialog.Action className={actionAttrClass()}>Confirm</AlertDialog.Action>
            <AlertDialog.Cancel className={cancelAttrClass()}>Cancel</AlertDialog.Cancel>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>

      <h2>Open</h2>
      <AlertDialog.Root defaultOpen>
        <AlertDialog.Trigger className={triggerAttrClass()}>delete everything</AlertDialog.Trigger>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className={overlayAttrClass()} style={{ top: '50%' }} />
          <AlertDialog.Content className={contentAttrClass()} style={{ top: '75%' }}>
            <AlertDialog.Title className={titleAttrClass()}>Title</AlertDialog.Title>
            <AlertDialog.Description className={descriptionAttrClass()}>
              Description
            </AlertDialog.Description>
            <AlertDialog.Action className={actionAttrClass()}>Confirm</AlertDialog.Action>
            <AlertDialog.Cancel className={cancelAttrClass()}>Cancel</AlertDialog.Cancel>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  </div>
);
Chromatic.parameters = { chromatic: { disable: false } };

const triggerClass = css({});

const RECOMMENDED_CSS__ALERT_DIALOG__OVERLAY: any = {
  // ensures overlay is positionned correctly
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};

const overlayClass = css({
  ...RECOMMENDED_CSS__ALERT_DIALOG__OVERLAY,
  backgroundColor: 'black',
  opacity: 0.2,
});

const RECOMMENDED_CSS__ALERT_DIALOG__CONTENT: any = {
  // ensures good default position for content
  position: 'fixed',
  top: 0,
  left: 0,
};

const contentClass = css({
  ...RECOMMENDED_CSS__ALERT_DIALOG__CONTENT,
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  background: 'white',
  minWidth: 300,
  minHeight: 150,
  padding: 50,
  borderRadius: 10,
  backgroundColor: 'white',
  boxShadow: '0 2px 10px rgba(0, 0, 0, 0.12)',
});

const cancelClass = css({
  appearance: 'none',
  padding: 10,
  border: 'none',
  background: '$grey100',
});

const actionClass = css({
  appearance: 'none',
  padding: 10,
  border: 'none',
  backgroundColor: '$red',
  color: '$white',
});

const titleClass = css({});

const descriptionClass = css({});

const chromaticContentClass = css(contentClass, {
  padding: 10,
  minWidth: 'auto',
  minHeight: 'auto',
});

const styles = {
  backgroundColor: 'rgba(0, 0, 255, 0.3)',
  border: '2px solid blue',
  padding: 10,

  '&[data-state="closed"]': { borderColor: 'red' },
  '&[data-state="open"]': { borderColor: 'green' },
};
const triggerAttrClass = css(styles);
const overlayAttrClass = css(overlayClass, styles);
const contentAttrClass = css(chromaticContentClass, styles);
const cancelAttrClass = css(styles);
const actionAttrClass = css(styles);
const titleAttrClass = css(styles);
const descriptionAttrClass = css(styles);
