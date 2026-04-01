import type { HTMLAttributes, PropsWithChildren } from 'react'
import { cn } from '@renderer/lib/utils'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string
  description?: string
}

export const Card = ({
  className,
  title,
  description,
  children,
  ...props
}: PropsWithChildren<CardProps>): JSX.Element => (
  <section className={cn('card', className)} {...props}>
    {title || description ? (
      <header className="card__header">
        {title ? <h3 className="card__title">{title}</h3> : null}
        {description ? <p className="card__description">{description}</p> : null}
      </header>
    ) : null}
    {children}
  </section>
)
