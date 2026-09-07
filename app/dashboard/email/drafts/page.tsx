import type { Metadata } from 'next'
import { FolderPage } from '../components/folder-page'

export const metadata: Metadata = { title: 'Drafts' }

export default async function DraftsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const params = await searchParams
  const currentPage = Math.max(1, parseInt(params.page || '1', 10))

  return (
    <FolderPage
      folder="drafts"
      title="Drafts"
      emptyMessage="No drafts"
      currentPage={currentPage}
    />
  )
}
