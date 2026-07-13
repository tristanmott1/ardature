import { type ClipboardEvent as ReactClipboardEvent, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { X } from "lucide-react";

type BarcodeDetectorResult = {
  rawValue: string;
};

type BarcodeDetectorInstance = {
  detect: (source: CanvasImageSource) => Promise<BarcodeDetectorResult[]>;
};

type BarcodeDetectorConstructor = new (options: { formats: string[] }) => BarcodeDetectorInstance;

type ExtendedMediaTrackCapabilities = MediaTrackCapabilities & {
  focusMode?: string[];
  torch?: boolean;
};

type ExtendedMediaTrackConstraintSet = MediaTrackConstraintSet & {
  focusMode?: string;
  torch?: boolean;
};

export function QrPanel({ text }: { text: string }) {
  const [svg, setSvg] = useState("");

  useEffect(() => {
    let cancelled = false;

    QRCode.toString(text, { errorCorrectionLevel: "L", margin: 4, type: "svg" })
      .then((nextSvg) => {
        if (!cancelled) {
          setSvg(nextSvg.replace("<svg ", '<svg shape-rendering="crispEdges" '));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSvg("");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [text]);

  if (!svg) {
    return null;
  }

  return (
    <div className="qr-panel">
      <div className="qr-code" role="img" aria-label="QR code" data-qr-text={text} dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}

export function QrScanner({
  onCancel,
  onScan,
  title,
}: {
  onCancel: () => void;
  onScan: (value: string) => void;
  title: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scannedRef = useRef(false);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Looking for QR");
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);

  useEffect(() => {
    const detectorConstructor = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
    let detector: BarcodeDetectorInstance | null = null;
    let frame = 0;
    let scanTimeout = 0;
    let stream: MediaStream | null = null;
    const scanSize = 1024;

    try {
      detector = detectorConstructor ? new detectorConstructor({ formats: ["qr_code"] }) : null;
    } catch {
      detector = null;
    }

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            aspectRatio: { ideal: 1 },
            facingMode: { ideal: "environment" },
            height: { ideal: 1440 },
            width: { ideal: 1440 },
          },
        });
        const [track] = stream.getVideoTracks();
        trackRef.current = track ?? null;

        if (track) {
          const capabilities = track.getCapabilities?.() as ExtendedMediaTrackCapabilities | undefined;
          const advanced: ExtendedMediaTrackConstraintSet[] = [];

          if (capabilities?.focusMode?.includes("continuous")) {
            advanced.push({ focusMode: "continuous" });
          }

          if (capabilities?.torch) {
            setTorchSupported(true);
          }

          if (advanced.length > 0) {
            await track.applyConstraints({ advanced }).catch(() => undefined);
          }
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          scan();
        }
      } catch {
        setError("Camera unavailable");
        setStatus("");
      }
    }

    async function readQrCode(canvas: HTMLCanvasElement, image: ImageData) {
      if (detector) {
        const results = await detector.detect(canvas).catch(() => []);
        const value = results[0]?.rawValue;

        if (value) {
          return value;
        }
      }

      return jsQR(image.data, image.width, image.height, {
        inversionAttempts: "attemptBoth",
      })?.data ?? null;
    }

    async function scanFrame() {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!video || !canvas || scannedRef.current) {
        return;
      }

      if (video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0 && video.videoHeight > 0) {
        const sourceSize = Math.min(video.videoWidth, video.videoHeight);
        const sourceX = Math.floor((video.videoWidth - sourceSize) / 2);
        const sourceY = Math.floor((video.videoHeight - sourceSize) / 2);
        canvas.width = scanSize;
        canvas.height = scanSize;
        const context = canvas.getContext("2d", { willReadFrequently: true });

        if (context) {
          // Match the visible scanner square so decoding ignores cropped camera edges.
          context.drawImage(video, sourceX, sourceY, sourceSize, sourceSize, 0, 0, scanSize, scanSize);
          const image = context.getImageData(0, 0, canvas.width, canvas.height);
          const code = await readQrCode(canvas, image);

          if (code) {
            scannedRef.current = true;
            setStatus("QR found");
            scanTimeout = window.setTimeout(() => onScan(code), 120);
            return;
          }
        }
      }

      frame = window.requestAnimationFrame(scan);
    }

    function scan() {
      void scanFrame();
    }

    void startCamera();

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(scanTimeout);
      stream?.getTracks().forEach((track) => track.stop());
      trackRef.current = null;
    };
  }, [onScan]);

  async function toggleTorch() {
    const track = trackRef.current;

    if (!track) {
      return;
    }

    const nextTorch = !torchOn;
    await track.applyConstraints({ advanced: [{ torch: nextTorch } as ExtendedMediaTrackConstraintSet] }).catch(() => undefined);
    setTorchOn(nextTorch);
  }

  function handlePaste(event: ReactClipboardEvent<HTMLElement>) {
    const value = event.clipboardData.getData("text").trim();
    if (!value || scannedRef.current) {
      return;
    }

    scannedRef.current = true;
    setStatus("QR found");
    onScan(value);
  }

  return (
    <div className="modal-scrim" role="presentation">
      <section className="scanner-modal" role="dialog" aria-modal="true" aria-labelledby="scanner-title" onPaste={handlePaste}>
        <div className="panel-header">
          <h1 id="scanner-title">{title}</h1>
          <button className="icon-button" type="button" onClick={onCancel} aria-label="Cancel">
            <X size={18} />
          </button>
        </div>
        <div className="scanner-frame">
          <video ref={videoRef} muted playsInline />
          <span className="scanner-target" aria-hidden="true" />
        </div>
        {torchSupported ? (
          <button className="secondary wide-button" type="button" onClick={toggleTorch}>
            {torchOn ? "Torch off" : "Torch on"}
          </button>
        ) : null}
        <canvas ref={canvasRef} hidden />
        <p className="sync-status">{error || status}</p>
      </section>
    </div>
  );
}
