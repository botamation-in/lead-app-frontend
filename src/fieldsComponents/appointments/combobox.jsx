'use client'

import * as Headless from '@headlessui/react'
import clsx from 'clsx'
import { useState } from 'react'

export function Combobox({
  options,
  displayValue,
  filter,
  anchor = 'bottom',
  className,
  placeholder,
  autoFocus,
  'aria-label': ariaLabel,
  children,
  dropdownClassName,
  ...props
}) {
  const [query, setQuery] = useState('')

  const filteredOptions =
    query === ''
      ? options
      : options.filter((option) =>
        filter ? filter(option, query) : displayValue(option)?.toLowerCase().includes(query.toLowerCase())
      )

  return (
    <Headless.Combobox {...props} multiple={false} virtual={{ options: filteredOptions }} onClose={() => setQuery('')}>
      <span
        data-slot="control"
        className={clsx([
          'relative block',
          className,
          // Removed after ring and focus-within ring to prevent outer layer selection
          'has-data-disabled:opacity-50',
        ])}
      >
        <Headless.ComboboxInput
          autoFocus={autoFocus}
          data-slot="control"
          aria-label={ariaLabel}
          displayValue={(option) => displayValue(option) ?? ''}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          className={clsx([
            'combobox-padding-margin',
            'relative block w-full appearance-none rounded-lg py-1.5',
            'pr-9 pl-3',
            'text-xs text-slate-700 placeholder:text-slate-400',
            'border border-slate-300 data-hover:border-slate-400 dark:border-white/10 dark:data-hover:border-white/20',
            'bg-transparent dark:bg-white/5',
            'focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:ring-inset focus:border-indigo-500',
            'data-invalid:border-red-500 data-invalid:data-hover:border-red-500 dark:data-invalid:border-red-500 dark:data-invalid:data-hover:border-red-500',
            'data-disabled:border-zinc-950/20 dark:data-disabled:border-white/15 dark:data-disabled:bg-white/2.5 dark:data-hover:data-disabled:border-white/15',
            'dark:scheme-dark',
          ])}
        />
        <Headless.ComboboxButton className="group absolute inset-y-0 right-0 flex items-center px-2">
          <svg
            className="size-4 stroke-zinc-500 group-data-disabled:stroke-zinc-600 group-data-hover:stroke-zinc-700 dark:stroke-zinc-400 dark:group-data-hover:stroke-zinc-300 forced-colors:stroke-[CanvasText]"
            viewBox="0 0 16 16"
            aria-hidden="true"
            fill="none"
          >
            <path d="M5.75 10.75L8 13L10.25 10.75" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            <path d="M10.25 5.25L8 3L5.75 5.25" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Headless.ComboboxButton>
      </span>
      <Headless.ComboboxOptions
        transition
        anchor={anchor}
        className={clsx(
          '[--anchor-gap:0.5rem] [--anchor-padding:1rem] sm:data-[anchor~=start]:[--anchor-offset:-4px]',
          'z-50 scroll-py-1 rounded-xl p-1 pb-2 select-none empty:invisible',
          'outline outline-transparent focus:outline-hidden',
          'overflow-y-scroll overscroll-contain',
          'bg-white dark:bg-zinc-800',
          'shadow-lg ring-1 ring-zinc-950/10 dark:ring-white/10 dark:ring-inset',
          'transition-opacity duration-100 ease-in data-closed:data-leave:opacity-0 data-transition:pointer-events-none',
          'min-w-[var(--input-width)] w-[var(--input-width)]',
          dropdownClassName
        )}
      >
        {({ option, index }) => {
          const isLast = index === filteredOptions.length - 1;
          return children(option, isLast);
        }}
      </Headless.ComboboxOptions>
    </Headless.Combobox>
  )
}

export function ComboboxOption({ children, className, ...props }) {
  let sharedClasses = clsx(
    'flex min-w-0 items-center',
    '*:data-[slot=icon]:size-4 *:data-[slot=icon]:shrink-0',
    '*:data-[slot=icon]:text-zinc-500 group-data-focus/option:*:data-[slot=icon]:text-indigo-700 dark:*:data-[slot=icon]:text-indigo-400',
    'forced-colors:*:data-[slot=icon]:text-[CanvasText] forced-colors:group-data-focus/option:*:data-[slot=icon]:text-[Canvas]',
    '*:data-[slot=avatar]:-mx-0.5 *:data-[slot=avatar]:size-5'
  );

  const optionClassName = clsx(
    'combobox-padding-margin',
    'group/option grid w-full cursor-pointer grid-cols-[1fr_1.25rem] items-baseline gap-x-2 rounded-lg py-1.5 px-3',
    'text-xs text-slate-700 dark:text-slate-300 forced-colors:text-[CanvasText]',
    'outline-hidden data-focus:bg-indigo-50 data-focus:text-indigo-700 hover:bg-indigo-50 hover:text-indigo-700',
    'forced-color-adjust-none forced-colors:data-focus:bg-[Highlight] forced-colors:data-focus:text-[HighlightText]',
    'data-disabled:opacity-50',
    className,
    props.isLast ? 'mb-1' : '',
    '!border-none !outline-none' // Remove border and outline from option
  );

  return (
    <Headless.ComboboxOption
      {...props}
      className={optionClassName}
    >
      <span className={sharedClasses + ' group-hover/option:text-indigo-700'}>{children}</span>
      <svg
        className="relative col-start-2 hidden size-4 self-center stroke-current group-data-selected/option:inline"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <path d="M4 8.5l3 3L12 4" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Headless.ComboboxOption>
  );
}

export function ComboboxLabel({ className, ...props }) {
  return <span {...props} className={clsx(className, 'ml-2 truncate first:ml-0')} />
}

export function ComboboxDescription({ className, children, ...props }) {
  return (
    <span
      {...props}
      className={clsx(
        className,
        'flex flex-1 overflow-hidden text-zinc-500 group-data-focus/option:text-white before:w-2 before:min-w-0 before:shrink dark:text-zinc-400'
      )}
    >
      <span className="flex-1 truncate">{children}</span>
    </span>
  )
}
