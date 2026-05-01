import React from 'react';
import PropTypes from 'prop-types';
import '../../styles/components/grid.css';

/* ============================================================
   Grid / Layout components — consumes CSS variable tokens
   ============================================================ */

/**
 * Container — centred, max-width wrapper.
 * size: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'fluid'
 */
export function Container({ size = 'xl', className = '', children, as: Tag = 'div', ...rest }) {
  return (
    <Tag
      className={[
        'ds-container',
        size !== 'fluid' ? `ds-container--${size}` : 'ds-container--fluid',
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

/**
 * Section — vertical padding wrapper (page section).
 * size: 'sm' | 'base' | 'lg'
 */
export function Section({ size = 'base', className = '', children, as: Tag = 'section', ...rest }) {
  return (
    <Tag
      className={[
        'ds-section',
        size === 'sm' ? 'ds-section--sm' : size === 'lg' ? 'ds-section--lg' : '',
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

/**
 * Row — horizontal flex row.
 * gap:     'base' | 'sm' | 'lg' | 'xl' | '2xl'
 * align:   'start' | 'center' | 'end' | 'stretch'
 * justify: 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly'
 * wrap:    boolean (default true)
 * reverse: boolean
 */
export function Row({
  gap = 'base',
  align,
  justify,
  wrap = true,
  reverse = false,
  className = '',
  children,
  as: Tag = 'div',
  ...rest
}) {
  return (
    <Tag
      className={[
        'ds-row',
        gap !== 'base' ? `ds-row--gap-${gap}` : '',
        align   ? `ds-row--align-${align}`   : '',
        justify ? `ds-row--${justify}`        : '',
        !wrap   ? 'ds-row--no-wrap'           : '',
        reverse ? 'ds-row--reverse'           : '',
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

/**
 * Col — flex column.
 * span: 1–12 | 'auto'  (default: stretches to fill)
 */
export function Col({ span, className = '', children, as: Tag = 'div', ...rest }) {
  return (
    <Tag
      className={[
        span ? `ds-col-${span}` : 'ds-col',
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

/**
 * Grid — CSS grid wrapper.
 * cols:     1 | 2 | 3 | 4 | 6 | 12 | 'auto-sm' | 'auto-md' | 'auto-lg'
 * gap:      'base' | 'sm' | 'lg' | 'xl'
 */
export function Grid({
  cols = 1,
  gap = 'base',
  className = '',
  children,
  as: Tag = 'div',
  ...rest
}) {
  const colsClass =
    typeof cols === 'number'
      ? `ds-grid--cols-${cols}`
      : `ds-grid--auto-${cols.replace('auto-', '')}`;

  return (
    <Tag
      className={[
        'ds-grid',
        colsClass,
        gap !== 'base' ? `ds-grid--gap-${gap}` : '',
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

/**
 * Stack — vertical flex column.
 * gap: 'base' | 'sm' | 'lg' | 'xl'
 */
export function Stack({ gap = 'base', className = '', children, as: Tag = 'div', ...rest }) {
  return (
    <Tag
      className={[
        'ds-stack',
        gap !== 'base' ? `ds-stack--${gap}` : '',
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

/**
 * Card — surface with border and shadow.
 */
export function Card({ className = '', children, as: Tag = 'div', ...rest }) {
  return (
    <Tag className={['ds-card', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </Tag>
  );
}

export function CardHeader({ className = '', children, ...rest }) {
  return <div className={['ds-card__header', className].filter(Boolean).join(' ')} {...rest}>{children}</div>;
}

export function CardBody({ className = '', children, ...rest }) {
  return <div className={['ds-card__body', className].filter(Boolean).join(' ')} {...rest}>{children}</div>;
}

export function CardFooter({ className = '', children, ...rest }) {
  return <div className={['ds-card__footer', className].filter(Boolean).join(' ')} {...rest}>{children}</div>;
}

// ---- Prop types --------------------------------------------------------------
const sharedProps = {
  className: PropTypes.string,
  children:  PropTypes.node,
  as:        PropTypes.elementType,
};

Container.propTypes = {
  ...sharedProps,
  size: PropTypes.oneOf(['sm', 'md', 'lg', 'xl', '2xl', 'fluid']),
};

Section.propTypes = {
  ...sharedProps,
  size: PropTypes.oneOf(['sm', 'base', 'lg']),
};

Row.propTypes = {
  ...sharedProps,
  gap:     PropTypes.oneOf(['base', 'sm', 'lg', 'xl', '2xl']),
  align:   PropTypes.oneOf(['start', 'center', 'end', 'stretch']),
  justify: PropTypes.oneOf(['start', 'center', 'end', 'between', 'around', 'evenly']),
  wrap:    PropTypes.bool,
  reverse: PropTypes.bool,
};

Col.propTypes = {
  ...sharedProps,
  span: PropTypes.oneOfType([PropTypes.number, PropTypes.oneOf(['auto'])]),
};

Grid.propTypes = {
  ...sharedProps,
  cols: PropTypes.oneOfType([
    PropTypes.oneOf([1, 2, 3, 4, 6, 12]),
    PropTypes.oneOf(['auto-sm', 'auto-md', 'auto-lg']),
  ]),
  gap: PropTypes.oneOf(['base', 'sm', 'lg', 'xl']),
};

Stack.propTypes = {
  ...sharedProps,
  gap: PropTypes.oneOf(['base', 'sm', 'lg', 'xl']),
};

Card.propTypes       = sharedProps;
CardHeader.propTypes = { className: PropTypes.string, children: PropTypes.node };
CardBody.propTypes   = { className: PropTypes.string, children: PropTypes.node };
CardFooter.propTypes = { className: PropTypes.string, children: PropTypes.node };
