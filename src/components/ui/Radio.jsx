import React, { useId } from 'react';
import PropTypes from 'prop-types';
import '../../styles/components/radio.css';

/* ============================================================
   Radio component — consumes CSS variable tokens
   ============================================================ */

/**
 * RadioGroup — wraps a set of Radio / RadioCard items.
 * direction: 'vertical' | 'horizontal'
 */
export function RadioGroup({
  direction = 'vertical',
  className = '',
  children,
  ...rest
}) {
  return (
    <div
      role="radiogroup"
      className={[
        'ds-radio-group',
        direction === 'horizontal' ? 'ds-radio-group--horizontal' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </div>
  );
}

/**
 * Radio — a single radio option.
 *
 * Props:
 *   label       – visible label text (required)
 *   description – optional helper text below the label
 *   value       – native input value
 *   name        – native input name (shared by a group)
 *   checked     – controlled
 *   defaultChecked – uncontrolled
 *   onChange    – handler
 *   disabled    – disables the control
 */
export function Radio({
  label,
  description,
  value,
  name,
  checked,
  defaultChecked,
  onChange,
  disabled = false,
  className = '',
  id: externalId,
  ...rest
}) {
  const generatedId = useId();
  const id = externalId || generatedId;

  return (
    <label
      htmlFor={id}
      className={[
        'ds-radio-field',
        disabled ? 'ds-radio-field--disabled' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <input
        id={id}
        type="radio"
        name={name}
        value={value}
        checked={checked}
        defaultChecked={defaultChecked}
        onChange={onChange}
        disabled={disabled}
        {...rest}
      />
      <span className="ds-radio-control" aria-hidden="true" />
      <span className="ds-radio-content">
        <span className="ds-radio-label">{label}</span>
        {description && (
          <span className="ds-radio-description">{description}</span>
        )}
      </span>
    </label>
  );
}

/**
 * RadioCard — card-style radio button.
 */
export function RadioCard({
  label,
  description,
  value,
  name,
  checked = false,
  defaultChecked,
  onChange,
  disabled = false,
  children,
  className = '',
  id: externalId,
  ...rest
}) {
  const generatedId = useId();
  const id = externalId || generatedId;

  return (
    <label
      htmlFor={id}
      className={[
        'ds-radio-card',
        checked  ? 'ds-radio-card--checked'  : '',
        disabled ? 'ds-radio-card--disabled' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <input
        id={id}
        type="radio"
        name={name}
        value={value}
        checked={checked}
        defaultChecked={defaultChecked}
        onChange={onChange}
        disabled={disabled}
        style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
        {...rest}
      />
      <span className="ds-radio-control" aria-hidden="true" />
      <span className="ds-radio-content">
        {label && <span className="ds-radio-label">{label}</span>}
        {description && <span className="ds-radio-description">{description}</span>}
        {children}
      </span>
    </label>
  );
}

// ---- Prop types --------------------------------------------------------------
RadioGroup.propTypes = {
  direction: PropTypes.oneOf(['vertical', 'horizontal']),
  className: PropTypes.string,
  children:  PropTypes.node,
};

const radioShared = {
  label:          PropTypes.string,
  description:    PropTypes.string,
  value:          PropTypes.string,
  name:           PropTypes.string,
  checked:        PropTypes.bool,
  defaultChecked: PropTypes.bool,
  onChange:       PropTypes.func,
  disabled:       PropTypes.bool,
  className:      PropTypes.string,
  id:             PropTypes.string,
};

Radio.propTypes     = { ...radioShared, label: PropTypes.string.isRequired };
RadioCard.propTypes = { ...radioShared, children: PropTypes.node };
