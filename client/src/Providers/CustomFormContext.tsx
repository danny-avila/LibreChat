import React, { createContext, PropsWithChildren, ReactElement, useContext, useMemo } from 'react';
import type {
  Control,
  // FieldErrors,
  FieldValues,
  UseFormReset,
  UseFormRegister,
  UseFormGetValues,
  UseFormHandleSubmit,
  UseFormSetValue,
} from 'react-hook-form';

interface FormContextValue<TFieldValues extends FieldValues> {
  register: UseFormRegister<TFieldValues>;
  control: Control<TFieldValues>;
  // errors: FieldErrors<TFieldValues>;
  getValues: UseFormGetValues<TFieldValues>;
  setValue: UseFormSetValue<TFieldValues>;
  handleSubmit: UseFormHandleSubmit<TFieldValues>;
  reset: UseFormReset<TFieldValues>;
}

function createFormContext<TFieldValues extends FieldValues>() {
  const context = createContext<FormContextValue<TFieldValues> | undefined>(undefined);

  const useCustomFormContext = (): FormContextValue<TFieldValues> => {
    const value = useContext(context);
    if (!value) {
      throw new Error('useCustomFormContext must be used within a CustomFormProvider');
    }
    return value;
  };

  const CustomFormProvider = ({
    register,
    control,
    setValue,
    // errors,
    getValues,
    handleSubmit,
    reset,
    children,
  }: PropsWithChildren<FormContextValue<TFieldValues>>): ReactElement => {
    const value = useMemo(
      () => ({ register, control, getValues, setValue, handleSubmit, reset }),
      [register, control, setValue, getValues, handleSubmit, reset],
    );

    return <context.Provider value={value}>{children}</context.Provider>;
  };

  return { CustomFormProvider, useCustomFormContext };
}

export type { FormContextValue };
export { createFormContext };
