import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button, Input, Label, OGDialog, OGDialogTemplate, Spinner, TextareaAutosize } from '@librechat/client';
import type { Dispatch, SetStateAction } from 'react';
import type { TContact, TContactRequest } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';

type ContactDialogProps = {
  open: boolean;
  onOpenChange: Dispatch<SetStateAction<boolean>>;
  contact?: TContact;
  onSubmit: (data: TContactRequest) => Promise<void>;
  onError: (error: unknown) => void;
};

type ContactFormValues = {
  name: string;
  company: string;
  role: string;
  email: string;
  phone: string;
  tags: string;
  notes: string;
};

const ContactDialog = ({ open, onOpenChange, contact, onSubmit, onError }: ContactDialogProps) => {
  const localize = useLocalize();
  const [isSaving, setIsSaving] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ContactFormValues>({
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: {
      name: '',
      company: '',
      role: '',
      email: '',
      phone: '',
      tags: '',
      notes: '',
    },
  });

  useEffect(() => {
    reset({
      name: contact?.name ?? '',
      company: contact?.company ?? '',
      role: contact?.role ?? '',
      email: contact?.email ?? '',
      phone: contact?.phone ?? '',
      tags: contact?.tags?.join(', ') ?? '',
      notes: contact?.notes ?? '',
    });
  }, [contact, reset, open]);

  const handleFormSubmit = async (values: ContactFormValues) => {
    if (isSaving) {
      return;
    }

    setIsSaving(true);
    try {
      await onSubmit({
        name: values.name.trim(),
        company: values.company.trim(),
        role: values.role.trim(),
        email: values.email.trim(),
        phone: values.phone.trim(),
        tags: values.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter((tag) => tag !== ''),
        notes: values.notes.trim(),
      });
      onOpenChange(false);
    } catch (error) {
      onError(error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogTemplate
        title={contact ? localize('com_ui_contacts_edit') : localize('com_ui_contacts_new')}
        showCloseButton={false}
        className="w-11/12 md:max-w-2xl"
        main={
          <form className="space-y-4" onSubmit={handleSubmit(handleFormSubmit)}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="contact-name">{localize('com_ui_contacts_name')}</Label>
                <Input
                  id="contact-name"
                    className="text-black dark:text-white"
                  {...register('name', { required: localize('com_ui_field_required') })}
                  aria-invalid={!!errors.name}
                  aria-describedby={errors.name ? 'contact-name-error' : undefined}
                />
                {errors.name && (
                  <p id="contact-name-error" className="text-sm text-red-500">
                    {errors.name.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="contact-company">{localize('com_ui_contacts_company')}</Label>
                <Input id="contact-company"   className="text-black dark:text-white" {...register('company')} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="contact-role">{localize('com_ui_contacts_role')}</Label>
                <Input id="contact-role"  className="text-black dark:text-white" {...register('role')} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="contact-email">{localize('com_ui_contacts_email')}</Label>
                <Input id="contact-email" type="email"   className="text-black dark:text-white" {...register('email')} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="contact-phone">{localize('com_ui_contacts_phone')}</Label>
                <Input id="contact-phone"   className="text-black dark:text-white" {...register('phone')} />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="contact-tags">{localize('com_ui_contacts_tags')}</Label>
                <Input id="contact-tags"  className="text-black dark:text-white" {...register('tags')} placeholder="tag-one, tag-two" />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="contact-notes">{localize('com_ui_contacts_notes')}</Label>
                <TextareaAutosize
                  id="contact-notes"
                 className="min-h-28 w-full rounded-lg border border-border-light bg-transparent px-3 py-2 text-sm text-black dark:text-white outline-none"
                  {...register('notes')}
                />
              </div>
            </div>
          </form>
        }
        buttons={
          <Button
            variant="submit"
            type="submit"
            className="text-white"
            disabled={isSaving}
            onClick={() => handleSubmit(handleFormSubmit)()}
          >
            {isSaving ? <Spinner /> : localize('com_ui_save')}
          </Button>
        }
      />
    </OGDialog>
  );
};

export default ContactDialog;