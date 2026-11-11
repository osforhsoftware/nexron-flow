import { toDataURL } from "qrcode";

export type QrKind = "product" | "equipment";

export function scanUrl(kind: QrKind, id: string) {
  return `${window.location.origin}/scan/${kind}/${encodeURIComponent(id)}`;
}

export function qrDataUrl(text: string) {
  return toDataURL(text, {
    width: 512,
    margin: 1,
    errorCorrectionLevel: "M",
  });
}

export function qrFileName(title: string) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug || "qr"}-qr.png`;
}

export function downloadQr(image: string, fileName: string) {
  const link = document.createElement("a");
  link.href = image;
  link.download = fileName;
  link.click();
}
