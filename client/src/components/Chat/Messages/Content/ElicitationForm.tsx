import React, { useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@librechat/client';
import { useLocalize } from '~/hooks';

interface ElicitationPropertySchema {
  type: 'string' | 'number' | 'integer' | 'boolean';
  title?: string;
  description?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  format?: 'email' | 'uri' | 'date' | 'date-time';
  default?: string | number | boolean;
  enum?: string[];
  enumNames?: string[];
}

interface ElicitationRequestSchema {
  type: 'object';
  properties: Record<string, ElicitationPropertySchema>;
  required?: string[];
}

interface ElicitationRequest {
  message: string;
  requestedSchema: ElicitationRequestSchema;
}

interface ElicitationFormProps {
  request: ElicitationRequest;
  serverName: string;
  onAccept: (data: Record<string, unknown>) => void;
  onDecline: () => void;
  onCancel: () => void;
}

export default function ElicitationForm({
  request,
  serverName,
  onAccept,
  onDecline,
  onCancel,
}: ElicitationFormProps) {
  const localize = useLocalize();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
  } = useForm<Record<string, unknown>>();

  // Set default values
  React.useEffect(() => {
    Object.entries(request.requestedSchema.properties).forEach(([key, property]) => {
      if (property.default !== undefined) {
        setValue(key, property.default);
      }
    });
  }, [request.requestedSchema.properties, setValue]);

  const onSubmit = useCallback(
    async (data: Record<string, unknown>) => {
      setIsSubmitting(true);
      try {
        onAccept(data);
      } finally {
        setIsSubmitting(false);
      }
    },
    [onAccept],
  );

  const renderField = (key: string, property: ElicitationPropertySchema) => {
    const isRequired = request.requestedSchema.required?.includes(key) ?? false;
    const fieldId = `elicitation-${key}`;

    // Validation rules
    const validationRules: Record<string, unknown> = {
      required: isRequired ? `${property.title || key} is required` : false,
    };

    if (property.type === 'string') {
      if (property.minLength)
        validationRules.minLength = {
          value: property.minLength,
          message: `Minimum length is ${property.minLength}`,
        };
      if (property.maxLength)
        validationRules.maxLength = {
          value: property.maxLength,
          message: `Maximum length is ${property.maxLength}`,
        };
      if (property.format === 'email')
        validationRules.pattern = {
          value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
          message: 'Please enter a valid email address',
        };
    }

    if (property.type === 'number' || property.type === 'integer') {
      if (property.minimum !== undefined)
        validationRules.min = {
          value: property.minimum,
          message: `Minimum value is ${property.minimum}`,
        };
      if (property.maximum !== undefined)
        validationRules.max = {
          value: property.maximum,
          message: `Maximum value is ${property.maximum}`,
        };
    }

    const renderInput = () => {
      if (property.enum) {
        return (
          <select
            id={fieldId}
            {...register(key, validationRules)}
            className="w-full rounded border border-border-medium bg-surface-primary px-3 py-2 text-text-primary focus:border-border-heavy focus:outline-none"
          >
            <option value="">{localize('com_ui_select')}</option>
            {property.enum.map((option, index) => (
              <option key={option} value={option}>
                {property.enumNames?.[index] || option}
              </option>
            ))}
          </select>
        );
      }

      if (property.type === 'boolean') {
        return (
          <div className="flex items-center">
            <input
              id={fieldId}
              type="checkbox"
              {...register(key, validationRules)}
              className="h-4 w-4 rounded border-border-medium text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor={fieldId} className="ml-2 text-sm text-text-primary">
              {property.title || key}
            </label>
          </div>
        );
      }

      if (property.type === 'number' || property.type === 'integer') {
        return (
          <input
            id={fieldId}
            type="number"
            step={property.type === 'integer' ? '1' : 'any'}
            {...register(key, {
              ...validationRules,
              valueAsNumber: true,
            })}
            className="w-full rounded border border-border-medium bg-surface-primary px-3 py-2 text-text-primary focus:border-border-heavy focus:outline-none"
          />
        );
      }

      let inputType = 'text';
      if (property.format === 'email') {
        inputType = 'email';
      } else if (property.format === 'date') {
        inputType = 'date';
      } else if (property.format === 'date-time') {
        inputType = 'datetime-local';
      }

      return (
        <input
          id={fieldId}
          type={inputType}
          {...register(key, validationRules)}
          className="w-full rounded border border-border-medium bg-surface-primary px-3 py-2 text-text-primary focus:border-border-heavy focus:outline-none"
        />
      );
    };

    return (
      <div key={key} className="mb-4">
        <label htmlFor={fieldId} className="mb-2 block text-sm font-medium text-text-primary">
          {property.title || key}
          {isRequired && <span className="ml-1 text-red-500">*</span>}
        </label>

        {property.description && (
          <p className="mb-2 whitespace-pre-line text-xs text-text-secondary">
            {property.description}
          </p>
        )}

        {renderInput()}

        {errors[key] && (
          <p className="mt-1 text-xs text-red-500">{errors[key]?.message as string}</p>
        )}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-2xl rounded-lg border border-border-medium bg-surface-primary p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-text-primary">{localize('com_ui_input')}</h3>
        <span className="rounded bg-surface-secondary px-2 py-1 text-xs text-text-secondary">
          {serverName}
        </span>
      </div>

      <p className="mb-6 whitespace-pre-line text-text-primary">{request.message}</p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {Object.entries(request.requestedSchema.properties).map(([key, property]) =>
          renderField(key, property),
        )}

        <div className="flex justify-end space-x-3 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-4 py-2"
          >
            {localize('com_ui_cancel')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onDecline}
            disabled={isSubmitting}
            className="px-4 py-2"
          >
            {localize('com_ui_decline')}
          </Button>
          <Button type="submit" variant="default" disabled={isSubmitting} className="px-4 py-2">
            {isSubmitting ? localize('com_ui_submit') : localize('com_ui_accept')}
          </Button>
        </div>
      </form>
    </div>
  );
}
