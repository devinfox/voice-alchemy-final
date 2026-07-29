import { FolderPage } from '../components/folder-page'

// Always render fresh — never serve a cached version that could omit recent sends.
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export default async function SentPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const params = await searchParams
  const currentPage = Math.max(1, parseInt(params.page || '1', 10))

  return (
    <FolderPage
      folder="sent"
      title="Sent"
      emptyMessage="No sent emails yet"
      currentPage={currentPage}
    />
  )
}
