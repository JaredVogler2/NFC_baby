import 'server-only'
import QRCode from 'qrcode'

/** QR fallback for a tag: encodes exactly the same URL as the NFC sticker. */
export async function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 })
}
