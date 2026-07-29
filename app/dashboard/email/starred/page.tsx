import { FolderPage } from '../components/folder-page'

export default async function StarredPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const params = await searchParams
  const currentPage = Math.max(1, parseInt(params.page || '1', 10))

  return (
    <FolderPage
      folder="inbox"
      title="Starred"
      emptyMessage="No starred emails"
      isStarred
      currentPage={currentPage}
    />
  )
}
