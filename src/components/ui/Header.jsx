import React, { forwardRef } from 'react';
import PropTypes from 'prop-types';
import '../../styles/components/header.css';

/* ============================================================
   Header component — consumes CSS variable tokens
   ============================================================ */

/**
 * Header
 *
 * Props:
 *   variant  – 'light' | 'dark' | 'glass'  (default 'light')
 *   scrolled – add elevated shadow (controlled by parent via scroll listener)
 *   split    – use start / center / end layout
 */
export const Header = forwardRef(function Header(
  {
    variant = 'light',
    scrolled = false,
    split = false,
    className = '',
    children,
    ...rest
  },
  ref
) {
  const classes = [
    'ds-header',
    variant !== 'light' ? `ds-header--${variant}` : '',
    scrolled ? 'ds-header--scrolled' : '',
    split    ? 'ds-header--split'    : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <header ref={ref} className={classes} {...rest}>
      {children}
    </header>
  );
});

Header.displayName = 'Header';

/** Left-aligned slot */
export function HeaderStart({ className = '', children, ...rest }) {
  return (
    <div className={['ds-header__start', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  );
}

/** Center slot */
export function HeaderCenter({ className = '', children, ...rest }) {
  return (
    <div className={['ds-header__center', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  );
}

/** Right-aligned slot */
export function HeaderEnd({ className = '', children, ...rest }) {
  return (
    <div className={['ds-header__end', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  );
}

/** Brand / logo area */
export function HeaderBrand({ as: Tag = 'a', className = '', children, ...rest }) {
  return (
    <Tag className={['ds-header__brand', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </Tag>
  );
}

/** Navigation link list */
export function HeaderNav({ className = '', children, ...rest }) {
  return (
    <nav className={['ds-header__nav', className].filter(Boolean).join(' ')} aria-label="Main" {...rest}>
      {children}
    </nav>
  );
}

/** Individual nav link */
export function HeaderNavLink({ active = false, as: Tag = 'a', className = '', children, ...rest }) {
  return (
    <Tag
      className={[
        'ds-header__nav-link',
        active ? 'ds-header__nav-link--active' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-current={active ? 'page' : undefined}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/** Vertical divider between header sections */
export function HeaderDivider({ className = '', ...rest }) {
  return <span className={['ds-header__divider', className].filter(Boolean).join(' ')} aria-hidden="true" {...rest} />;
}

// ---- Prop types --------------------------------------------------------------
const sharedProps = { className: PropTypes.string, children: PropTypes.node };

Header.propTypes = {
  ...sharedProps,
  variant:  PropTypes.oneOf(['light', 'dark', 'glass']),
  scrolled: PropTypes.bool,
  split:    PropTypes.bool,
};

HeaderBrand.propTypes    = { ...sharedProps, as: PropTypes.elementType };
HeaderNavLink.propTypes  = { ...sharedProps, as: PropTypes.elementType, active: PropTypes.bool };
HeaderDivider.propTypes  = { className: PropTypes.string };
