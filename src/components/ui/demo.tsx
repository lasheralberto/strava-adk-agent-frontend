import { useToasts } from '@/components/ui/toast'
import { Button } from '@/components/ui/button-1'

export default function UndoDemo() {
  const toasts = useToasts()

  return (
    <Button
      onClick={(): void => {
        toasts.message({
          text: 'The Evil Rabbit jumped over the fence. The Evil Rabbit jumped over the fence again.',
          onUndoAction: () => undefined,
        })
      }}
    >
      Show Toast
    </Button>
  )
}