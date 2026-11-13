import { Plus, X } from "lucide-react";
import type { ServicePhoto } from "../db/types";
import { fileToItemImageDataUrl } from "../lib/itemImage";

type Props = {
  photos: ServicePhoto[];
  onChange: (photos: ServicePhoto[]) => void;
  onError?: (message: string) => void;
  label?: string;
};

export function InspectionPhotoGrid({
  photos,
  onChange,
  onError,
  label = "Inspection Photos",
}: Props) {
  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const next: ServicePhoto[] = [];
    for (const file of Array.from(files)) {
      try {
        const url = await fileToItemImageDataUrl(file);
        next.push({ url, name: file.name, caption: "", kind: "inspection" });
      } catch (err) {
        onError?.(err instanceof Error ? err.message : "Could not process image.");
      }
    }
    if (next.length) onChange([...photos, ...next]);
  }

  function updateCaption(index: number, caption: string) {
    onChange(photos.map((p, i) => (i === index ? { ...p, caption } : p)));
  }

  function removeAt(index: number) {
    onChange(photos.filter((_, i) => i !== index));
  }

  return (
    <div className="insp-photo-block">
      {label || photos.length ? (
        <div className="insp-photo-head">
          {label ? <h3>{label}</h3> : <span />}
          {photos.length ? (
            <span className="insp-photo-status">
              {photos.length} photo{photos.length === 1 ? "" : "s"} ready
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="insp-photo-grid">
        {photos.map((photo, index) => (
          <div className="insp-photo-card" key={`${photo.url.slice(0, 32)}_${index}`}>
            <div className="insp-photo-thumb">
              <img src={photo.url} alt={photo.caption || photo.name || `Photo ${index + 1}`} />
              <button
                type="button"
                className="insp-photo-remove"
                aria-label="Remove photo"
                onClick={() => removeAt(index)}
              >
                <X size={14} />
              </button>
            </div>
            <textarea
              className="insp-photo-caption"
              value={photo.caption ?? ""}
              placeholder="Description beside this photo"
              rows={2}
              onChange={(e) => updateCaption(index, e.target.value)}
            />
          </div>
        ))}

        <label className="insp-photo-add">
          <input
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              void addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <Plus size={28} strokeWidth={1.75} />
          <span>Add</span>
        </label>
      </div>
    </div>
  );
}
