import { FolderPage } from '../components/folder-page'

export default async function SpamPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const params = await searchParams
  const currentPage = Math.max(1, parseInt(params.page || '1', 10))

  return (
    <FolderPage
      folder="spam"
      title="Spam"
      emptyMessage="No spam emails"
      currentPage={currentPage}
    />
  )
}
