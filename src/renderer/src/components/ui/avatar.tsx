import { cn } from '@renderer/lib/utils'

interface AvatarProps {
  initials: string
  size?: 'sm' | 'md' | 'lg'
}

export const Avatar = ({ initials, size = 'md' }: AvatarProps): JSX.Element => (
  <div className={cn('avatar', `avatar--${size}`)}>{initials}</div>
)
