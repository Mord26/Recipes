'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';

const buttonVariants = {
  primary:
    'bg-terra-600 text-cream-50 shadow-[0_8px_20px_-8px_rgba(181,78,40,0.5),inset_0_1px_0_rgba(255,255,255,0.2)] hover:bg-terra-500',
  secondary: 'bg-ink-900 text-cream-50 hover:bg-ink-700',
  soft: 'bg-terra-50 text-terra-700 hover:bg-terra-100',
  ghost: 'bg-transparent text-ink-700 hover:bg-cream-100',
  outline: 'bg-white/70 text-ink-900 ring-1 ring-ink-900/10 hover:bg-white',
  danger: 'bg-white/70 text-terra-700 ring-1 ring-terra-600/25 hover:bg-terra-50',
} as const;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof buttonVariants;
  size?: 'sm' | 'md' | 'lg';
}

export function Button({ variant = 'primary', size = 'md', className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-300 ease-fluid active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50',
        size === 'sm' && 'px-4 py-2 text-sm',
        size === 'md' && 'px-6 py-3 text-[15px]',
        size === 'lg' && 'w-full px-6 py-4 text-base',
        buttonVariants[variant],
        className
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full rounded-2xl bg-white/80 px-4 py-3.5 text-[15px] text-ink-900 shadow-[inset_0_1px_2px_rgba(41,32,21,0.04)] ring-1 ring-ink-900/8 transition-all duration-300 ease-fluid placeholder:text-ink-300 focus:bg-white focus:ring-2 focus:ring-terra-500/50 focus:outline-none',
        className
      )}
      {...props}
    />
  );
}

export function PasswordInput({
  className,
  defaultVisible = false,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { defaultVisible?: boolean }) {
  const [show, setShow] = useState(defaultVisible);
  return (
    <div className="relative">
      <Input {...props} type={show ? 'text' : 'password'} className={cn('pe-12', className)} />
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        onClick={() => setShow((value) => !value)}
        className="absolute end-3.5 top-1/2 -translate-y-1/2 text-ink-300 transition-colors hover:text-ink-700"
      >
        {show ? <EyeOff size={18} strokeWidth={1.7} /> : <Eye size={18} strokeWidth={1.7} />}
      </button>
    </div>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full resize-none rounded-2xl bg-white/80 px-4 py-3.5 text-[15px] text-ink-900 shadow-[inset_0_1px_2px_rgba(41,32,21,0.04)] ring-1 ring-ink-900/8 transition-all duration-300 ease-fluid placeholder:text-ink-300 focus:bg-white focus:ring-2 focus:ring-terra-500/50 focus:outline-none',
        className
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('block space-y-1.5', className)}>
      <span className="block text-sm font-semibold text-ink-700">{label}</span>
      {children}
      {hint ? <span className="block text-xs leading-relaxed text-ink-500">{hint}</span> : null}
    </label>
  );
}

export function Chip({
  active,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-all duration-300 ease-fluid active:scale-[0.96]',
        active
          ? 'bg-ink-900 text-cream-50 shadow-[0_6px_16px_-6px_rgba(41,32,21,0.5)]'
          : 'bg-white/70 text-ink-700 ring-1 ring-ink-900/8 hover:bg-white',
        className
      )}
      {...props}
    />
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full bg-terra-50 px-3 py-1 text-[10px] font-semibold tracking-[0.18em] text-terra-700 uppercase',
        className
      )}
    >
      {children}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-block size-5 animate-spin rounded-full border-2 border-current border-t-transparent',
        className
      )}
      aria-hidden
    />
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p className="rounded-2xl bg-terra-50 px-4 py-3 text-sm font-medium text-terra-700 ring-1 ring-terra-600/15">
      {children}
    </p>
  );
}

/** A compact on/off switch. Purely presentational - the caller owns the state and the confirmation. */
export function Toggle({
  checked,
  onClick,
  disabled,
  label,
}: {
  checked: boolean;
  onClick?: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'relative h-[26px] w-[46px] shrink-0 rounded-full transition-all duration-300 ease-fluid disabled:opacity-50',
        checked ? 'bg-sage-600' : 'bg-ink-900/15'
      )}
    >
      <span
        className={cn(
          'absolute top-[3px] size-5 rounded-full bg-white shadow-sm transition-all duration-300 ease-fluid',
          checked ? 'start-[23px]' : 'start-[3px]'
        )}
      />
    </button>
  );
}
