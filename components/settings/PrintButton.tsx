'use client'

import { PrinterIcon } from '@/components/icons'
import { Button } from '@/components/ui/Button'

export function PrintButton() {
  return (
    <Button variant="primary" icon={<PrinterIcon size={20} />} onClick={() => window.print()}>
      Print
    </Button>
  )
}
