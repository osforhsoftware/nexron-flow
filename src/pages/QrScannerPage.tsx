import { useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Camera, ImagePlus, QrCode, Upload } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { BrandLogo } from "../components/BrandLogo";
import { parseScanPayload } from "../lib/qrParse";

type Mode = "camera" | "upload";

async function safeStop(scanner: Html5Qrcode | null | undefined) {
  if (!scanner) return;
  try {
    if (scanner.isScanning) {
      await scanner.stop();
    }
  } catch {
    /* not running / already stopped */
  }
  try {
    scanner.clear();
  } catch {
    /* already cleared */
  }
}

export function QrScannerPage() {
  const navigate = useNavigate();
  const baseId = useId().replace(/:/g, "");
  const readerDomId = `${baseId}-cam`;
  const fileReaderDomId = `${baseId}-file`;
  const fileRef = useRef<HTMLInputElement>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const handlingRef = useRef(false);
  /** Serialize start/stop so React Strict Mode remounts do not race. */
  const cameraChainRef = useRef(Promise.resolve());

  const [mode, setMode] = useState<Mode>("camera");
  const [cameraBusy, setCameraBusy] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [notice, setNotice] = useState("");
  const [uploadBusy, setUploadBusy] = useState(false);

  function goToRecord(decoded: string) {
    const parsed = parseScanPayload(decoded);
    if (!parsed) {
      setNotice("This QR code is not a product or equipment label.");
      return;
    }
    navigate(`/scan/${parsed.kind}/${encodeURIComponent(parsed.id)}`, { replace: false });
  }

  useEffect(() => {
    if (mode !== "camera") return;

    let cancelled = false;
    let scanner: Html5Qrcode | null = null;

    setCameraBusy(true);
    setCameraError("");
    setNotice("");

    const run = cameraChainRef.current.then(async () => {
      if (cancelled) return;

      scanner = new Html5Qrcode(readerDomId);
      scannerRef.current = scanner;

      try {
        await scanner.start(
          { facingMode: "environment" },
          { fps: 8, qrbox: { width: 240, height: 240 } },
          (decoded) => {
            if (handlingRef.current || cancelled) return;
            handlingRef.current = true;
            void safeStop(scanner).finally(() => {
              goToRecord(decoded);
              handlingRef.current = false;
            });
          },
          () => undefined,
        );
      } catch (err: unknown) {
        if (cancelled) return;
        setCameraBusy(false);
        const message = err instanceof Error ? err.message : String(err);
        if (/NotAllowedError|Permission|denied/i.test(message)) {
          setCameraError("Camera permission was denied. Allow the camera, or upload a QR image instead.");
        } else if (/NotFoundError|DevicesNotFound|no camera/i.test(message)) {
          setCameraError("No camera was found on this device. Upload a QR image instead.");
        } else {
          setCameraError("Could not open the camera. Upload a QR image instead.");
        }
        await safeStop(scanner);
        scannerRef.current = null;
        return;
      }

      if (cancelled) {
        await safeStop(scanner);
        scannerRef.current = null;
        return;
      }
      setCameraBusy(false);
    });

    cameraChainRef.current = run.catch(() => undefined);

    return () => {
      cancelled = true;
      scannerRef.current = null;
      cameraChainRef.current = cameraChainRef.current
        .then(() => safeStop(scanner))
        .catch(() => undefined);
    };
    // goToRecord closes over navigate; remount only on mode / reader id
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, readerDomId]);

  async function onUpload(file: File | undefined) {
    if (!file) return;
    setUploadBusy(true);
    setNotice("");
    setCameraError("");
    try {
      await safeStop(scannerRef.current);
      scannerRef.current = null;
      const decoder = new Html5Qrcode(fileReaderDomId);
      const decoded = await decoder.scanFile(file, true);
      try {
        decoder.clear();
      } catch {
        /* ignore */
      }
      goToRecord(decoded);
    } catch {
      setNotice("No QR code found in that image. Try a clearer photo of the label.");
    } finally {
      setUploadBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <main className="scan-screen">
      <article className="scan-card scan-scanner-card">
        <header className="scan-card-head">
          <BrandLogo size={36} showWordmark wordmarkSize="sm" />
          <span className="scan-kind">Scan QR</span>
        </header>

        <div className="scan-hero">
          <div>
            <h1>Scan product or equipment</h1>
            <p className="muted">Use the camera or upload a QR label photo to open the full live record.</p>
          </div>
        </div>

        <div className="scan-mode-tabs" role="tablist" aria-label="Scan method">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "camera"}
            className={mode === "camera" ? "active" : ""}
            onClick={() => setMode("camera")}
          >
            <Camera size={14} /> Camera
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "upload"}
            className={mode === "upload" ? "active" : ""}
            onClick={() => setMode("upload")}
          >
            <Upload size={14} /> Upload
          </button>
        </div>

        <div className="scan-camera-panel" hidden={mode !== "camera"}>
          <div id={readerDomId} className="scan-camera-view" />
          {cameraBusy ? <p className="scan-status">Requesting camera permission…</p> : null}
          {cameraError ? <p className="scan-notice">{cameraError}</p> : null}
          {!cameraBusy && !cameraError ? (
            <p className="muted scan-hint-inline">Point the camera at a product or equipment QR label.</p>
          ) : null}
        </div>

        {mode === "upload" ? (
          <div className="scan-upload-panel">
            <button
              className="btn btn-primary"
              type="button"
              disabled={uploadBusy}
              onClick={() => fileRef.current?.click()}
            >
              <ImagePlus size={14} /> {uploadBusy ? "Reading image…" : "Choose QR image"}
            </button>
            <p className="muted scan-hint-inline">PNG or JPG of a printed product/equipment QR label.</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => void onUpload(e.target.files?.[0])}
            />
          </div>
        ) : null}

        {notice ? <p className="scan-notice">{notice}</p> : null}
        <div id={fileReaderDomId} className="scan-file-reader" aria-hidden="true" />

        <div className="scan-scanner-foot">
          <QrCode size={14} />
          <span className="muted">Labels are created from Products and Equipment rows.</span>
          <Link className="btn btn-ghost" to="/">
            Home
          </Link>
        </div>
      </article>
    </main>
  );
}
