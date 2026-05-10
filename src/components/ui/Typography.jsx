import React from 'react';
import PropTypes from 'prop-types';
import '../../styles/components/typography.css';

/* ============================================================
   Typography components — all consume CSS variable tokens.
   ============================================================ */

/** Display – largest decorative heading */
export function Display({ as: Tag = 'h1', className = '', children, ...rest }) {
  return (
    <Tag className={['ds-display', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </Tag>
  );
}

/** H1 */
export function H1({ className = '', children, ...rest }) {
  return (
    <h1 className={['ds-h1', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </h1>
  );
}

/** H2 */
export function H2({ className = '', children, ...rest }) {
  return (
    <h2 className={['ds-h2', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </h2>
  );
}

/** H3 */
export function H3({ className = '', children, ...rest }) {
  return (
    <h3 className={['ds-h3', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </h3>
  );
}

/** H4 */
export function H4({ className = '', children, ...rest }) {
  return (
    <h4 className={['ds-h4', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </h4>
  );
}

/** H5 */
export function H5({ className = '', children, ...rest }) {
  return (
    <h5 className={['ds-h5', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </h5>
  );
}

/** H6 */
export function H6({ className = '', children, ...rest }) {
  return (
    <h6 className={['ds-h6', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </h6>
  );
}

/**
 * Heading – polymorphic heading component.
 * Use `level` (1–6) to pick the tag and the matching heading style.
 */
export function Heading({ level = 1, className = '', children, ...rest }) {
  const Tag = `h${level}`;
  return (
    <Tag className={[`ds-h${level}`, className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </Tag>
  );
}

/** Subheading – small all-caps label above a section */
export function Subheading({ as: Tag = 'p', className = '', children, ...rest }) {
  return (
    <Tag className={['ds-subheading', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </Tag>
  );
}

/**
 * Text – body copy.
 * size: 'sm' | 'base' | 'lg'
 */
export function Text({ size = 'base', className = '', as: Tag = 'p', children, ...rest }) {
  const cls = size === 'lg' ? 'ds-body-lg' : size === 'sm' ? 'ds-body-sm' : 'ds-body';
  return (
    <Tag className={[cls, className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </Tag>
  );
}

/** Label – form field label or inline label */
export function Label({ size = 'base', className = '', as: Tag = 'label', children, ...rest }) {
  const cls = size === 'sm' ? 'ds-label-sm' : 'ds-label';
  return (
    <Tag className={[cls, className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </Tag>
  );
}

/** Caption – small helper / descriptive text */
export function Caption({ as: Tag = 'p', className = '', children, ...rest }) {
  return (
    <Tag className={['ds-caption', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </Tag>
  );
}

/** Overline – tiny all-caps eyebrow above a title */
export function Overline({ as: Tag = 'p', className = '', children, ...rest }) {
  return (
    <Tag className={['ds-overline', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </Tag>
  );
}

/** Code – inline code snippet */
export function Code({ className = '', children, ...rest }) {
  return (
    <code className={['ds-code', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </code>
  );
}

// ---- Shared prop types -------------------------------------------------------
const sharedProps = {
  className: PropTypes.string,
  children:  PropTypes.node,
};

Display.propTypes    = { ...sharedProps, as: PropTypes.elementType };
Heading.propTypes    = { ...sharedProps, level: PropTypes.oneOf([1, 2, 3, 4, 5, 6]) };
Subheading.propTypes = { ...sharedProps, as: PropTypes.elementType };
Text.propTypes       = { ...sharedProps, as: PropTypes.elementType, size: PropTypes.oneOf(['sm', 'base', 'lg']) };
Label.propTypes      = { ...sharedProps, as: PropTypes.elementType, size: PropTypes.oneOf(['sm', 'base']) };
Caption.propTypes    = { ...sharedProps, as: PropTypes.elementType };
Overline.propTypes   = { ...sharedProps, as: PropTypes.elementType };
Code.propTypes       = sharedProps;
