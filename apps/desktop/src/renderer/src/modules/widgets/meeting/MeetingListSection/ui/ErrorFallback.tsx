import Button from '@renderer/shared/components/primitives/ui/Button'

import styles from './ErrorFallback.module.css'

interface ErrorFallbackProps {
  message: string
  onRetry: () => void
}

export default function ErrorFallback({ message, onRetry }: ErrorFallbackProps) {
  return (
    <div className={styles.container}>
      <p className={styles.message}>{message}</p>
      <Button variant="secondary" onClick={onRetry}>
        다시 시도
      </Button>
    </div>
  )
}
