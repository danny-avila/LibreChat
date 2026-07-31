import { Star, MapPin } from 'lucide-react';
import { Tools } from 'librechat-data-provider';
import type {
  TAttachment,
  ImageResult,
  PlaceResult,
  ShoppingResult,
} from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

const MAX_VERTICAL_ITEMS = 8;
const MAX_PLACES = 5;

export interface SearchVerticalData {
  images: ImageResult[];
  shopping: ShoppingResult[];
  places: PlaceResult[];
}

/** Serper vertical results (image/shopping/place) merged across a call's
 *  `web_search` attachments. Attachment-only: verticals never stream. */
export function collectSearchVerticals(attachments?: TAttachment[]): SearchVerticalData {
  const images: ImageResult[] = [];
  const shopping: ShoppingResult[] = [];
  const places: PlaceResult[] = [];
  for (const att of attachments ?? []) {
    const data = att.type === Tools.web_search ? att[Tools.web_search] : undefined;
    if (!data) {
      continue;
    }
    images.push(...(data.images ?? []));
    shopping.push(...(data.shopping ?? []));
    places.push(...(data.places ?? []));
  }
  return { images, shopping, places };
}

function RatingBadge({ rating, ratingCount }: { rating?: number; ratingCount?: number }) {
  if (rating == null) {
    return null;
  }
  return (
    <span className="flex items-center gap-1 text-[11px] text-text-secondary">
      <Star className="size-3 fill-current" aria-hidden="true" />
      {rating}
      {ratingCount != null && <span className="text-text-secondary">({ratingCount})</span>}
    </span>
  );
}

function ImageStrip({ images, label }: { images: ImageResult[]; label: string }) {
  return (
    <ul className="flex list-none gap-2 overflow-x-auto pb-1" aria-label={label}>
      {images.slice(0, MAX_VERTICAL_ITEMS).map((image, i) => {
        const href = image.link || image.googleUrl || image.imageUrl;
        const ratio =
          image.thumbnailWidth && image.thumbnailHeight
            ? `${image.thumbnailWidth} / ${image.thumbnailHeight}`
            : '1 / 1';
        return (
          <li key={image.thumbnailUrl || image.imageUrl || i} className="shrink-0">
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={image.title || image.domain || label}
              className="block h-28 overflow-hidden rounded-xl border border-border-light no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-heavy"
              style={{ aspectRatio: ratio }}
            >
              <img
                src={image.thumbnailUrl || image.imageUrl}
                alt={image.title || ''}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function ShoppingStrip({ items, label }: { items: ShoppingResult[]; label: string }) {
  return (
    <ul className="flex list-none gap-2.5 overflow-x-auto pb-1" aria-label={label}>
      {items.slice(0, MAX_VERTICAL_ITEMS).map((item, i) => (
        <li key={item.productId || item.link || i} className="flex w-40 shrink-0">
          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full flex-col rounded-xl border border-border-light p-2 no-underline transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-heavy"
          >
            {item.imageUrl && (
              <div className="mb-2 aspect-square w-full shrink-0 overflow-hidden rounded-lg bg-surface-tertiary">
                <img
                  src={item.imageUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
            )}
            <span className="mt-auto block truncate text-xs font-medium text-text-primary">
              {item.title}
            </span>
            {(item.price || item.source) && (
              <span className="mt-0.5 block truncate text-[11px] text-text-secondary">
                {[item.price, item.source].filter(Boolean).join(' · ')}
              </span>
            )}
            {item.delivery && (
              <span className="block truncate text-[11px] text-text-secondary">
                {item.delivery}
              </span>
            )}
            <span className="mt-0.5 block">
              <RatingBadge rating={item.rating} ratingCount={item.ratingCount} />
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function PlaceList({ places, label }: { places: PlaceResult[]; label: string }) {
  return (
    <ul
      className="list-none overflow-hidden rounded-lg border border-border-light"
      aria-label={label}
    >
      {places.slice(0, MAX_PLACES).map((place, i) => (
        <li
          key={place.identifier || place.name || i}
          className={cn(
            'flex items-center gap-2.5 px-3 py-2',
            i > 0 && 'border-t border-border-light',
          )}
        >
          <MapPin className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium text-text-primary">
              {place.name}
            </span>
            {(place.category || place.address) && (
              <span className="block truncate text-[11px] text-text-secondary">
                {[place.category, place.address].filter(Boolean).join(' · ')}
              </span>
            )}
          </span>
          <span className="shrink-0">
            <RatingBadge rating={place.rating} ratingCount={place.ratingCount} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Always-visible search verticals. Rendered under the web search row when
 *  ungrouped, and hoisted below the group (like attachments) when the call
 *  lives inside a collapsed tool group. */
export default function SearchVerticals({ attachments }: { attachments?: TAttachment[] }) {
  const localize = useLocalize();
  const { images, shopping, places } = collectSearchVerticals(attachments);

  if (images.length === 0 && shopping.length === 0 && places.length === 0) {
    return null;
  }

  return (
    <div className="my-1.5 space-y-2">
      {images.length > 0 && (
        <ImageStrip images={images} label={localize('com_ui_web_search_images')} />
      )}
      {shopping.length > 0 && (
        <ShoppingStrip items={shopping} label={localize('com_ui_web_search_shopping')} />
      )}
      {places.length > 0 && (
        <PlaceList places={places} label={localize('com_ui_web_search_places')} />
      )}
    </div>
  );
}
