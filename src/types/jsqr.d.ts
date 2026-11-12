/**
 * Declaraciones mínimas para jsqr (el paquete no incluye tipos).
 * https://github.com/cozmo/jsQR
 */
declare module 'jsqr' {
  export interface QRCode {
    data: string;
    binaryData: Uint8ClampedArray;
    version: number;
  }

  export default function jsQR(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    options?: {
      inversionAttempts?: 'dontInvert' | 'onlyInvert' | 'attemptBoth' | 'invertFirst';
    }
  ): QRCode | null;
}
