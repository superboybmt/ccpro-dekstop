import { cn } from '@renderer/lib/utils'

interface AvatarProps {
  initials: string
  size?: 'sm' | 'md' | 'lg'
  src?: string | null
  className?: string
  onClick?: () => void
}

export const Avatar = ({ initials, size = 'md', src, className, onClick }: AvatarProps): JSX.Element => (
  <div className={cn('avatar', `avatar--${size}`, className)} onClick={onClick}>
    {src ? (
      <img src={src.startsWith('data:') ? src : `data:image/webp;base64,${src}`} alt="Avatar" className="avatar__img" />
    ) : (
      initials
    )}
  </div>
)
