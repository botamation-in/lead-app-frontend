import React, { forwardRef } from 'react';
import PropTypes from 'prop-types';
import '../../styles/components/button.css';

/**
 * Button
 *
 * Props:
 *   variant  – 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'  (default: 'primary')
 *   size     – 'sm' | 'md' | 'lg'  (default: 'md')
 *   block    – stretch to full width
 *   loading  – show spinner, disable interaction
 *   iconOnly – square aspect ratio for icon-only buttons
 *   as       – polymorphic element / component (default: 'button')
 */
const Button = forwardRef(function Button(
  {
    variant = 'primary',
    size = 'md',
    block = false,
    loading = false,
    iconOnly = false,
    as: Component = 'button',
    className = '',
    children,
    disabled,
    ...rest
  },
  ref
) {
  const classes = [
    'btn',
    `btn--${variant}`,
    `btn--${size}`,
    block    ? 'btn--block'   : '',
    loading  ? 'btn--loading' : '',
    iconOnly ? 'btn--icon'    : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Component
      ref={ref}
      className={classes}
      disabled={disabled || loading}
      aria-disabled={disabled || loading || undefined}
      {...rest}
    >
      {children}
    </Component>
  );
});

Button.displayName = 'Button';

Button.propTypes = {
  variant:  PropTypes.oneOf(['primary', 'secondary', 'ghost', 'danger', 'outline']),
  size:     PropTypes.oneOf(['sm', 'md', 'lg']),
  block:    PropTypes.bool,
  loading:  PropTypes.bool,
  iconOnly: PropTypes.bool,
  as:       PropTypes.elementType,
  className: PropTypes.string,
  children:  PropTypes.node,
  disabled:  PropTypes.bool,
};

export default Button;
