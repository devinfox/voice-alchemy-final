'use client'

import ModernPitchTrainer from '@/components/ModernPitchTrainer'

interface TunerButtonProps {
  variant?: 'floating' | 'card'
}

export default function TunerButton({ variant = 'floating' }: TunerButtonProps) {
  return <ModernPitchTrainer variant={variant} />
}

