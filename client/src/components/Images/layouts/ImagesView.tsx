import ImageWorkspace from '../ImageWorkspace';

export default function ImagesView() {
  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-presentation">
      <ImageWorkspace />
    </div>
  );
}
