import React, { forwardRef } from 'react';
import PropTypes from 'prop-types';
import '../../styles/components/input.css';

/* ============================================================
   Input / TextBox component — consumes CSS variable tokens
   ============================================================ */

/**
 * Field wrapper — provides label, input, hint and error in one.
 */
export function Field({ className = '', children, ...rest }) {
  return (
    <div className={['ds-field', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  );
}

/** FieldLabel */
export function FieldLabel({ required = false, className = '', as: Tag = 'label', children, ...rest }) {
  return (
    <Tag
      className={[
        'ds-field__label',
        required ? 'ds-field__label--required' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/** FieldHint */
export function FieldHint({ className = '', children, ...rest }) {
  return (
    <p className={['ds-field__hint', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </p>
  );
}

/** FieldError */
export function FieldError({ className = '', children, ...rest }) {
  return (
    <p className={['ds-field__error', className].filter(Boolean).join(' ')} role="alert" {...rest}>
      {children}
    </p>
  );
}

/**
 * Input (TextBox)
 *
 * Props:
 *   size    – 'sm' | 'md' | 'lg'
 *   error   – show error state styling
 *   success – show success state styling
 *   leadingIcon  – React node rendered on the left
 *   trailingIcon – React node rendered on the right
 */
export const Input = forwardRef(function Input(
  {
    size = 'md',
    error = false,
    success = false,
    leadingIcon,
    trailingIcon,
    className = '',
    ...rest
  },
  ref
) {
  const sizeClass   = size !== 'md' ? `ds-input--${size}` : '';
  const errorClass  = error   ? 'ds-input--error'   : '';
  const successClass = success ? 'ds-input--success' : '';
  const leadingClass  = leadingIcon  ? 'ds-input--with-leading'  : '';
  const trailingClass = trailingIcon ? 'ds-input--with-trailing' : '';

  const inputClasses = [
    'ds-input',
    sizeClass,
    errorClass,
    successClass,
    leadingClass,
    trailingClass,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="ds-input-wrapper">
      {leadingIcon && (
        <span className="ds-input-icon ds-input-icon--leading" aria-hidden="true">
          {leadingIcon}
        </span>
      )}
      <input ref={ref} className={inputClasses} {...rest} />
      {trailingIcon && (
        <span className="ds-input-icon ds-input-icon--trailing" aria-hidden="true">
          {trailingIcon}
        </span>
      )}
    </div>
  );
});

Input.displayName = 'Input';

/**
 * Textarea
 */
export const Textarea = forwardRef(function Textarea(
  { error = false, className = '', ...rest },
  ref
) {
  return (
    <textarea
      ref={ref}
      className={[
        'ds-textarea',
        error ? 'ds-input--error' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    />
  );
});

Textarea.displayName = 'Textarea';

// ---- Prop types --------------------------------------------------------------
const sharedFieldProps = { className: PropTypes.string, children: PropTypes.node };

Field.propTypes      = sharedFieldProps;
FieldLabel.propTypes = { ...sharedFieldProps, required: PropTypes.bool, as: PropTypes.elementType };
FieldHint.propTypes  = sharedFieldProps;
FieldError.propTypes = sharedFieldProps;

Input.propTypes = {
  size:         PropTypes.oneOf(['sm', 'md', 'lg']),
  error:        PropTypes.bool,
  success:      PropTypes.bool,
  leadingIcon:  PropTypes.node,
  trailingIcon: PropTypes.node,
  className:    PropTypes.string,
};

Textarea.propTypes = {
  error:     PropTypes.bool,
  className: PropTypes.string,
};
