import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Eraser, PenLine, Upload } from "lucide-react";
import { fileToItemImageDataUrl } from "../lib/itemImage";

type Mode = "draw" | "upload";

type Props = {
  title: string;
  subtitle?: string;
  value?: string | null;
  onChange: (dataUrl: string | null) => void;
  onError?: (message: string) => void;
  icon?: "shield" | "check";
};

export function SignaturePadField({
  title,
  subtitle,
  value,
  onChange,
  onError,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [mode, setMode] = useState<Mode>(value && !value.startsWith("data:image") ? "upload" : "draw");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || mode !== "draw") return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      const w = Math.max(280, Math.floor(rect.width));
      const h = Math.max(140, Math.floor(rect.height));
      canvas.width = w * ratio;
      canvas.height = h * ratio;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#1a1f28";
      if (value?.startsWith("data:image")) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, w, h);
        img.src = value;
      } else {
        ctx.clearRect(0, 0, w, h);
      }
    };

    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- redraw when switching to draw or value clears
  }, [mode]);

  function point(e: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function commitCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const blank = document.createElement("canvas");
    blank.width = canvas.width;
    blank.height = canvas.height;
    if (canvas.toDataURL() === blank.toDataURL()) {
      onChange(null);
      return;
    }
    onChange(canvas.toDataURL("image/png"));
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    onChange(null);
  }

  async function onUpload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    try {
      const url = await fileToItemImageDataUrl(file);
      onChange(url);
      setMode("upload");
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Could not upload signature.");
    }
  }

  return (
    <div className="sig-card">
      <div className="sig-card-head">
        <div>
          <strong>{title}</strong>
          {subtitle ? <p className="muted">{subtitle}</p> : null}
        </div>
        <div className="sig-mode-toggle" role="group" aria-label="Signature mode">
          <button
            type="button"
            className={mode === "draw" ? "active" : ""}
            onClick={() => setMode("draw")}
          >
            <PenLine size={14} /> Draw
          </button>
          <button
            type="button"
            className={mode === "upload" ? "active" : ""}
            onClick={() => setMode("upload")}
          >
            <Upload size={14} /> Upload
          </button>
        </div>
      </div>

      {mode === "draw" ? (
        <>
          <canvas
            ref={canvasRef}
            className="sig-pad"
            onPointerDown={(e) => {
              const canvas = canvasRef.current;
              const ctx = canvas?.getContext("2d");
              if (!canvas || !ctx) return;
              drawing.current = true;
              canvas.setPointerCapture(e.pointerId);
              const p = point(e);
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
            }}
            onPointerMove={(e) => {
              if (!drawing.current) return;
              const ctx = canvasRef.current?.getContext("2d");
              if (!ctx) return;
              const p = point(e);
              ctx.lineTo(p.x, p.y);
              ctx.stroke();
            }}
            onPointerUp={() => {
              drawing.current = false;
              commitCanvas();
            }}
            onPointerLeave={() => {
              if (!drawing.current) return;
              drawing.current = false;
              commitCanvas();
            }}
          />
          <div className="sig-card-foot">
            <span className="muted">Draw the signature on the pad above.</span>
            <button type="button" className="sig-clear" onClick={clear}>
              <Eraser size={14} /> Clear signature
            </button>
          </div>
        </>
      ) : (
        <>
          <label className="sig-upload-zone">
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                void onUpload(e.target.files);
                e.target.value = "";
              }}
            />
            {value ? (
              <img src={value} alt="Uploaded signature" />
            ) : (
              <span>
                <Upload size={22} />
                Upload signature image
              </span>
            )}
          </label>
          <div className="sig-card-foot">
            <span className="muted">{value ? "Signature uploaded." : "PNG or JPG works best."}</span>
            {value ? (
              <button type="button" className="sig-clear" onClick={() => onChange(null)}>
                <Eraser size={14} /> Clear signature
              </button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
