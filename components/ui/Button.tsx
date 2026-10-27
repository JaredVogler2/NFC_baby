import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'

export type ButtonVariant =
  'primary' | 'secondary' | 'ghost' | 'danger' | 'wet' | 'poop' | 'both' | 'feed'

export type ButtonSize = 'md' | 'lg' | 'xl'

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-fg hover:brightness-110',
  secondary: 'bg-surface text-text border border-border-strong hover:bg-surface-2',
  ghost: 'bg-transparent text-text hover:bg-surface-2',
  danger: 'bg-danger text-danger-fg hover:brightness-110',
  wet: 'bg-wet text-wet-fg hover:brightness-110',
  poop: 'bg-poop text-poop-fg hover:brightness-110',
  both: 'bg-both text-both-fg hover:brightness-110',
  feed: 'bg-feed text-feed-fg hover:brightness-110',
}

const SIZE: Record<ButtonSize, string> = {
  md: 'min-h-11 px-4 text-base rounded-xl',
  lg: 'min-h-12 px-5 text-base rounded-2xl',
  xl: 'min-h-14 px-6 text-lg rounded-2xl',
}

export function buttonClass(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'lg',
  extra = '',
): string {
  return [
    'inline-flex items-center justify-center gap-2 font-semibold select-none',
    'transition-[filter,background-color,transform] duration-150 active:scale-[0.98]',
    'disabled:cursor-not-allowed disabled:opacity-55 disabled:active:scale-100',
    'touch-manipulation',
    VARIANT[variant],
    SIZE[size],
    extra,
  ]
    .filter(Boolean)
    .join(' ')
}

type ButtonProps = ComponentProps<'button'> & {
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
  icon?: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'lg',
  block,
  icon,
  className = '',
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass(variant, size, `${block ? 'w-full' : ''} ${className}`)}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
}

type LinkButtonProps = ComponentProps<typeof Link> & {
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
  icon?: ReactNode
}

export function LinkButton({
  variant = 'secondary',
  size = 'lg',
  block,
  icon,
  className = '',
  children,
  ...rest
}: LinkButtonProps) {
  return (
    <Link className={buttonClass(variant, size, `${block ? 'w-full' : ''} ${className}`)} {...rest}>
      {icon}
      {children}
    </Link>
  )
}
