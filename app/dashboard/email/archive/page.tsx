import { FolderPage } from '../components/folder-page'

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const params = await searchParams
  const currentPage = Math.max(1, parseInt(params.page || '1', 10))

  return (
    <FolderPage
      folder="archive"
      title="Archive"
      emptyMessage="No archived emails"
      currentPage={currentPage}
    />
  )
}
