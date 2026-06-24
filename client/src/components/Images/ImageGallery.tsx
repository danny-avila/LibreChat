import { Button } from '@librechat/client';
import { useImageGallery } from '~/data-provider';
import { useLocalize } from '~/hooks';
import Image from '~/components/Chat/Messages/Content/Image';
import type { TFile } from 'librechat-data-provider';

export default function ImageGallery() {
  const localize = useLocalize();
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useImageGallery();

  const images: TFile[] = data?.pages.flatMap((page) => page.images) ?? [];

  return (
    <section aria-label={localize('com_ui_my_images')} className="w-full max-w-2xl">
      <h2 className="mb-4 text-lg font-semibold text-text-primary">
        {localize('com_ui_my_images')}
      </h2>

      {images.length === 0 ? (
        <p className="text-sm text-text-secondary">{localize('com_ui_no_images')}</p>
      ) : (
        <>
          <div role="list" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {images.map((file) => (
              <div key={file.file_id} role="listitem">
                <Image
                  imagePath={file.filepath}
                  altText={file.filename}
                  args={{
                    prompt: (file.metadata as { imageGen?: { prompt?: string } } | undefined)
                      ?.imageGen?.prompt,
                  }}
                  width={file.width}
                  height={file.height}
                />
              </div>
            ))}
          </div>

          {hasNextPage && (
            <div className="mt-6 flex justify-center">
              <Button
                type="button"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                aria-label={localize('com_ui_load_more')}
              >
                {localize('com_ui_load_more')}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
