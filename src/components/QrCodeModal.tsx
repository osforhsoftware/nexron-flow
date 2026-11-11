import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Printer } from "lucide-react";
import { Modal } from "./Modal";
import { downloadQr, qrDataUrl, qrFileName, scanUrl, type QrKind } from "../lib/qrLabel";

export function QrCodeModal({
  kind,
  id,
  title,
  subtitle,
  onClose,
}: {
  kind: QrKind;
  id: string;
  title: string;
  subtitle: string;
  onClose: () => void;
}) {
  const url = scanUrl(kind, id);
  const [image, setImage] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    setImage("");
    setNotice("");
    void qrDataUrl(url)
      .then((data) => {
        if (!cancelled) setImage(data);
      })
      .catch(() => {
        if (!cancelled) setNotice("Could not build this QR code.");
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  function onPrint() {
    if (!image) return;
    window.print();
  }

  function onDownload() {
    if (!image) return;
    downloadQr(image, qrFileName(title));
  }

  return (
    <Modal
      title={kind === "product" ? "Product QR" : "Equipment QR"}
      className="qr-modal"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Close
          </button>
          <button className="btn btn-ghost" type="button" disabled={!image} onClick={onDownload}>
            <Download size={14} /> Download
          </button>
          <button className="btn btn-primary" type="button" disabled={!image} onClick={onPrint}>
            <Printer size={14} /> Print
          </button>
        </>
      }
    >
      <div className="qr-preview">
        {image ? <img src={image} alt={`QR code for ${title}`} /> : <div className="qr-pending">Building QR…</div>}
        <div className="qr-caption">
          <strong>{title}</strong>
          <div className="muted">{subtitle}</div>
        </div>
        <p className="muted qr-hint">Scan this code to open the full live record.</p>
        {notice ? <p className="qr-notice">{notice}</p> : null}
      </div>
      {image
        ? createPortal(
            <div className="qr-print-sheet">
              <img src={image} alt="" />
              <h1>{title}</h1>
              <p>{subtitle}</p>
            </div>,
            document.body,
          )
        : null}
    </Modal>
  );
}
