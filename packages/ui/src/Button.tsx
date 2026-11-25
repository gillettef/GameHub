import type { ButtonHTMLAttributes } from 'react'

export type ButtonTone = 'primary' | 'secondary' | 'ghost' | 'danger'

const TONES: Record<ButtonTone, string> = {
  primary: 'bg-primary text-on-primary font-bold',
  secondary: 'bg-raised text-text font-semibold',
  ghost: 'bg-transparent text-muted',
  danger: 'bg-transparent text-danger border border-danger',
}

export function Button({
  tone = 'secondary',
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: ButtonTone }) {
  return (
    <button
      type={type}
      className={`min-h-12 min-w-11 rounded-xl px-4 text-[15px] active:brightness-110 disabled:opacity-40 ${TONES[tone]} ${className}`}
      {...props}
    />
  )
}
