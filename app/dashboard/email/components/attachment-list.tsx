'use client'

import { Paperclip, X } from 'lucide-react'

interface AttachmentListProps {
  attachments: File[]
  onRemove: (index: number) => void
  maxTotalSize?: number
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

export function AttachmentList({
  attachments,
  onRemove,
  maxTotalSize = 25 * 1024 * 1024,
}: AttachmentListProps) {
  if (attachments.length === 0) return null

  const totalSize = attachments.reduce((total, file) => total + file.size, 0)

  return (
    <div className="px-4 py-2 border-t border-white/10">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-400">
          {attachments.length} attachment{attachments.length > 1 ? 's' : ''} ({formatFileSize(totalSize)})
        </span>
        <span className="text-xs text-gray-500">
          Max {formatFileSize(maxTotalSize)} total
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {attachments.map((file, index) => (
          <div
            key={index}
            className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-lg text-sm"
          >
            <Paperclip className="w-4 h-4 text-gray-400" />
            <span className="text-white truncate max-w-[150px]">{file.name}</span>
            <span className="text-gray-500 text-xs">
              {formatFileSize(file.size)}
            </span>
            <button
              onClick={() => onRemove(index)}
              className="text-gray-400 hover:text-red-400"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
