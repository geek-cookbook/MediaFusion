import { useState } from 'react'
import { ChevronLeft, ChevronRight, FileVideo, HardDrive, Hash, Loader2, Search, Tv } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { FileAnnotationDialog, type EditedFileLink, type FileLink } from '@/components/stream'
import { useStreamsNeedingAnnotation, useUpdateFileLinks } from '@/hooks'
import { catalogApi } from '@/lib/api'

import { formatBytes, formatTimeAgo } from './helpers'

export function AnnotationRequestsTab() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const { data, isLoading, refetch } = useStreamsNeedingAnnotation({
    page,
    per_page: 20,
    search: search || undefined,
  })
  const updateFileLinks = useUpdateFileLinks()

  const [selectedStream, setSelectedStream] = useState<{
    streamId: number
    streamName: string
    mediaId: number
    mediaTitle: string
  } | null>(null)
  const [annotationDialogOpen, setAnnotationDialogOpen] = useState(false)
  const [annotationFiles, setAnnotationFiles] = useState<FileLink[]>([])
  const [isLoadingFiles, setIsLoadingFiles] = useState(false)
  const [isSavingAnnotation, setIsSavingAnnotation] = useState(false)

  const handleSearch = () => {
    setSearch(searchInput)
    setPage(1)
  }

  const handleOpenAnnotation = async (stream: {
    stream_id: number
    stream_name: string
    media_id: number
    media_title: string
  }) => {
    setIsLoadingFiles(true)
    try {
      const files = await catalogApi.getStreamFiles(stream.stream_id)
      setAnnotationFiles(
        files.map((f) => ({
          file_id: f.file_id,
          file_name: f.file_name,
          size: f.size,
          season_number: f.season_number,
          episode_number: f.episode_number,
          episode_end: f.episode_end,
        })),
      )
      setSelectedStream({
        streamId: stream.stream_id,
        streamName: stream.stream_name,
        mediaId: stream.media_id,
        mediaTitle: stream.media_title,
      })
      setAnnotationDialogOpen(true)
    } catch (error) {
      console.error('Failed to load stream files:', error)
    } finally {
      setIsLoadingFiles(false)
    }
  }

  const handleSaveAnnotation = async (editedFiles: EditedFileLink[]) => {
    if (!selectedStream) return

    setIsSavingAnnotation(true)
    try {
      const updates = editedFiles
        .filter((f) => f.included)
        .map((f) => ({
          file_id: f.file_id,
          season_number: f.season_number,
          episode_number: f.episode_number,
          episode_end: f.episode_end ?? null,
        }))

      await updateFileLinks.mutateAsync({
        stream_id: selectedStream.streamId,
        media_id: selectedStream.mediaId,
        updates,
      })

      refetch()
      setAnnotationDialogOpen(false)
      setSelectedStream(null)
    } catch (error) {
      console.error('Failed to save annotations:', error)
      throw error
    } finally {
      setIsSavingAnnotation(false)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by stream name or series title..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="pl-9 rounded-xl"
          />
        </div>
        <Button onClick={handleSearch} className="rounded-xl">
          Search
        </Button>
      </div>

      {data && (
        <div className="p-3 rounded-xl bg-muted/50 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <FileVideo className="h-4 w-4 text-cyan-500" />
            <span className="text-sm">
              <strong>{data.total}</strong> streams need annotation
            </span>
          </div>
        </div>
      )}

      {!data?.items.length ? (
        <div className="text-center py-12">
          <FileVideo className="h-16 w-16 mx-auto text-muted-foreground opacity-50" />
          <p className="mt-4 text-lg font-medium">No annotation requests</p>
          <p className="text-sm text-muted-foreground mt-2">All series streams have proper episode mappings!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.items.map((stream) => (
            <Card key={stream.stream_id} className="glass border-border/50 hover:border-cyan-500/30 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className="p-2 rounded-xl flex-shrink-0 bg-cyan-500/10">
                    <FileVideo className="h-5 w-5 text-cyan-500" />
                  </div>

                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs bg-cyan-500/10 border-cyan-500/30">
                        {stream.unmapped_count} / {stream.file_count} files need mapping
                      </Badge>
                      {stream.resolution && (
                        <Badge variant="outline" className="text-xs">
                          {stream.resolution}
                        </Badge>
                      )}
                      {stream.source && (
                        <Badge variant="secondary" className="text-xs">
                          {stream.source}
                        </Badge>
                      )}
                    </div>

                    <p className="font-medium truncate" title={stream.stream_name}>
                      {stream.stream_name}
                    </p>

                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Tv className="h-3.5 w-3.5" />
                      <span className="truncate" title={stream.media_title}>
                        {stream.media_title}
                        {stream.media_year && ` (${stream.media_year})`}
                      </span>
                    </div>

                    {stream.info_hash && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Hash className="h-3 w-3" />
                        <span className="font-mono truncate">{stream.info_hash.slice(0, 16)}...</span>
                      </div>
                    )}

                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>{formatTimeAgo(stream.created_at)}</span>
                      {stream.size && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <HardDrive className="h-3 w-3" />
                            {formatBytes(stream.size)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      size="sm"
                      className="rounded-lg bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500"
                      onClick={() =>
                        handleOpenAnnotation({
                          stream_id: stream.stream_id,
                          stream_name: stream.stream_name,
                          media_id: stream.media_id,
                          media_title: stream.media_title,
                        })
                      }
                      disabled={isLoadingFiles}
                    >
                      {isLoadingFiles ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <FileVideo className="h-4 w-4 mr-1" />
                      )}
                      Annotate
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {data && data.total > 20 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="icon"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-xl"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="px-4 text-sm text-muted-foreground">
            Page {page} of {data.pages}
          </span>
          <Button
            variant="outline"
            size="icon"
            disabled={page >= data.pages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-xl"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {selectedStream && (
        <FileAnnotationDialog
          open={annotationDialogOpen}
          onOpenChange={(open) => {
            setAnnotationDialogOpen(open)
            if (!open) setSelectedStream(null)
          }}
          streamName={`${selectedStream.streamName} (${selectedStream.mediaTitle})`}
          initialFiles={annotationFiles}
          onSave={handleSaveAnnotation}
          isLoading={isSavingAnnotation}
        />
      )}
    </div>
  )
}
