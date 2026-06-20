import QRCode from "qrcode";

export async function createCompanionQrDataUrl(url: string) {
  if (!url.trim()) {
    throw new Error("A companion join URL is required.");
  }

  return QRCode.toDataURL(url, {
    color: {
      dark: "#050505",
      light: "#ffffff",
    },
    errorCorrectionLevel: "M",
    margin: 2,
    width: 240,
  });
}
