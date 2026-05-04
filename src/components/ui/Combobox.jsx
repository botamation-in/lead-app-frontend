import React, { useState, useRef, useEffect, useId, useCallback, forwardRef } from 'react';
import PropTypes from 'prop-types';
import '../../styles/components/combobox.css';

/* ============================================================
   Combobox / Select components — consume CSS variable tokens
   ============================================================ */

/* ---- Chevron icon ---------------------------------------- */
function ChevronIcon() {
  return (
    <svg
      className="ds-combobox__chevron"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 8l4 4 4-4" />
    </svg>
  );
}

/* ---- Check icon ------------------------------------------ */
function CheckIcon() {
  return (
    <svg
      className="ds-combobox__check"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 10l5 5 7-8" />
    </svg>
  );
}

/**
 * Combobox — searchable dropdown.
 *
 * Props:
 *   options       – array of { value, label, description?, disabled? }
 *   value         – controlled selected value
 *   onChange      – (value) => void
 *   placeholder   – input placeholder
 *   searchable    – enable typing to filter (default true)
 *   clearable     – show clear button when a value is selected
 *   disabled      – disable the control
 *   loading       – show loading text
 *   emptyText     – text when no options match
 *   groupBy       – key name on option to group by
 */
export function Combobox({
  options = [],
  value,
  onChange,
  placeholder = 'Select…',
  searchable = true,
  clearable = false,
  disabled = false,
  loading = false,
  emptyText = 'No options',
  className = '',
  dropdownClassName = '',
  id: externalId,
}) {
  const generatedId = useId();
  const id = externalId || generatedId;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const selectedOption = options.find((o) => o.value === value) || null;
  const displayValue = open && searchable ? query : (selectedOption?.label ?? '');

  // Filter options
  const filtered = query
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(query.toLowerCase()) ||
          String(o.value).toLowerCase().includes(query.toLowerCase())
      )
    : options;

  const closeMenu = useCallback(() => {
    setOpen(false);
    setQuery('');
    setFocusedIndex(-1);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        closeMenu();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, closeMenu]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') closeMenu(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, closeMenu]);

  function openMenu() {
    if (disabled) return;
    setOpen(true);
    setQuery('');
    setFocusedIndex(-1);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function selectOption(opt) {
    if (opt.disabled) return;
    onChange?.(opt.value);
    closeMenu();
  }

  function handleKeyDown(e) {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (e.key === 'Escape') { closeMenu(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && focusedIndex >= 0) {
      e.preventDefault();
      selectOption(filtered[focusedIndex]);
    }
  }

  return (
    <div
      ref={containerRef}
      className={['ds-combobox', open ? 'ds-combobox--open' : '', className].filter(Boolean).join(' ')}
    >
      <div className="ds-combobox__trigger">
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          className="ds-combobox__input"
          value={displayValue}
          placeholder={placeholder}
          readOnly={!searchable}
          disabled={disabled}
          onFocus={openMenu}
          onChange={(e) => {
            setQuery(e.target.value);
            setFocusedIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />

        {clearable && selectedOption && !open && (
          <button
            type="button"
            className="ds-combobox__clear"
            aria-label="Clear selection"
            onMouseDown={(e) => {
              e.preventDefault();
              onChange?.(null);
            }}
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} width={12} height={12} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l8 8M6 14L14 6" />
            </svg>
          </button>
        )}

        <ChevronIcon />
      </div>

      {open && (
        <div ref={listRef} className={['ds-combobox__panel', dropdownClassName].filter(Boolean).join(' ')} role="listbox">
          {loading ? (
            <div className="ds-combobox__loading">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="ds-combobox__empty">{emptyText}</div>
          ) : (
            filtered.map((opt, idx) => (
              <div
                key={opt.value}
                role="option"
                aria-selected={opt.value === value}
                className={[
                  'ds-combobox__option',
                  opt.value === value    ? 'ds-combobox__option--selected' : '',
                  idx === focusedIndex   ? 'ds-combobox__option--focused'  : '',
                  opt.disabled           ? 'ds-combobox__option--disabled' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectOption(opt);
                }}
                onMouseEnter={() => setFocusedIndex(idx)}
              >
                <span>{opt.label}</span>
                {opt.value === value && <CheckIcon />}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Select — native <select> styled with CSS variable tokens.
 *
 * Props:
 *   options   – array of { value, label, disabled? } or option group objects
 *   size      – 'sm' | 'md' | 'lg'
 */
export const Select = forwardRef(function Select(
  { options = [], size = 'md', className = '', children, ...rest },
  ref
) {
  const sizeClass = size !== 'md' ? `ds-select--${size}` : '';
  return (
    <select
      ref={ref}
      className={['ds-select', sizeClass, className].filter(Boolean).join(' ')}
      {...rest}
    >
      {children ||
        options.map((opt) =>
          opt.options ? (
            <optgroup key={opt.label} label={opt.label}>
              {opt.options.map((o) => (
                <option key={o.value} value={o.value} disabled={o.disabled}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          ) : (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          )
        )}
    </select>
  );
});

Select.displayName = 'Select';

// ---- Prop types --------------------------------------------------------------
const optionShape = PropTypes.shape({
  value:       PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  label:       PropTypes.string.isRequired,
  description: PropTypes.string,
  disabled:    PropTypes.bool,
});

Combobox.propTypes = {
  options:     PropTypes.arrayOf(optionShape),
  value:       PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onChange:    PropTypes.func,
  placeholder: PropTypes.string,
  searchable:  PropTypes.bool,
  clearable:   PropTypes.bool,
  disabled:    PropTypes.bool,
  loading:     PropTypes.bool,
  emptyText:   PropTypes.string,
  className:   PropTypes.string,
  id:          PropTypes.string,
};

Select.propTypes = {
  options:   PropTypes.array,
  size:      PropTypes.oneOf(['sm', 'md', 'lg']),
  className: PropTypes.string,
  children:  PropTypes.node,
};
