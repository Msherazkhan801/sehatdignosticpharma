"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import {
  Camera,
  X,
  Zap,
  ZapOff,
  SwitchCamera,
  Layers,
  CheckCircle2,
  AlertCircle,
  Keyboard,
  Volume2,
  VolumeX,
} from "lucide-react";

export interface ScanFeedback {
  text: string;
  isError?: boolean;
}

interface CameraScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (decodedText: string) => void;
  title?: string;
  subtitle?: string;
  continuousMode?: boolean;
  onToggleContinuousMode?: (enabled: boolean) => void;
  recentScanFeedback?: ScanFeedback | null;
}

// Play an instant POS beep using browser Web Audio API
export function playScanBeep(success = true) {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    if (success) {
      // Crisp, friendly high-tone beep
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } else {
      // Low tone error beep
      osc.frequency.setValueAtTime(320, ctx.currentTime);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    }
  } catch {
    // Audio context might be restricted before first gesture, ignore silently
  }
}

export function CameraScannerModal({
  isOpen,
  onClose,
  onScanSuccess,
  title = "Scan Medicine Barcode",
  subtitle = "Align the barcode or QR code within the frame to scan",
  continuousMode = false,
  onToggleContinuousMode,
  recentScanFeedback,
}: CameraScannerModalProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isMountedRef = useRef<boolean>(false);
  const isStoppingRef = useRef<boolean>(false);
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [activeCameraIndex, setActiveCameraIndex] = useState<number>(0);
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const [hasTorch, setHasTorch] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string>("");
  const [isStarting, setIsStarting] = useState<boolean>(true);
  const [manualInput, setManualInput] = useState<string>("");
  const [showManual, setShowManual] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const lastScannedCodeRef = useRef<{ code: string; time: number }>({
    code: "",
    time: 0,
  });

  const stopScanner = useCallback(async () => {
    if (isStoppingRef.current) return;
    const scanner = scannerRef.current;
    if (!scanner) return;
    isStoppingRef.current = true;
    scannerRef.current = null;

    try {
      if (scanner.isScanning) {
        await scanner.stop().catch(() => {});
      }
      scanner.clear();
    } catch {
      // Ignore transition errors safely
    } finally {
      isStoppingRef.current = false;
    }
  }, []);

  const startScanner = useCallback(
    async (cameraIdOrFacing: string | { facingMode: string }) => {
      setCameraError("");
      setIsStarting(true);

      await stopScanner();

      // Check if modal was closed while stopping
      if (!isMountedRef.current) {
        setIsStarting(false);
        return;
      }

      // Verify DOM element exists
      const element = document.getElementById("camera-reader-box");
      if (!element) {
        setIsStarting(false);
        return;
      }

      try {
        const scanner = new Html5Qrcode("camera-reader-box", {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.ITF,
            Html5QrcodeSupportedFormats.DATA_MATRIX,
          ],
          verbose: false,
        });

        if (!isMountedRef.current) {
          try {
            scanner.clear();
          } catch {
            // Ignore
          }
          setIsStarting(false);
          return;
        }

        scannerRef.current = scanner;

        // Config for wide barcode detection
        const qrboxFunction = (viewfinderWidth: number, viewfinderHeight: number) => {
          const width = Math.min(viewfinderWidth * 0.85, 360);
          const height = Math.min(viewfinderHeight * 0.55, 200);
          return { width: Math.floor(width), height: Math.floor(height) };
        };

        await scanner.start(
          cameraIdOrFacing,
          {
            fps: 15,
            qrbox: qrboxFunction,
            aspectRatio: 1.333333,
          },
          (decodedText) => {
            const trimmed = decodedText.trim();
            if (!trimmed) return;

            // Debounce rapid re-scans of the same item within 1.5 seconds in continuous mode
            const now = Date.now();
            if (
              lastScannedCodeRef.current.code === trimmed &&
              now - lastScannedCodeRef.current.time < 1500
            ) {
              return;
            }
            lastScannedCodeRef.current = { code: trimmed, time: now };

            if (soundEnabled) {
              playScanBeep(true);
            }

            onScanSuccess(trimmed);

            if (!continuousMode) {
              onClose();
            }
          },
          () => {
            // Frame error ignore
          }
        );

        // If unmounted while start was resolving, stop immediately
        if (!isMountedRef.current) {
          if (scanner.isScanning) {
            await scanner.stop().catch(() => {});
          }
          try {
            scanner.clear();
          } catch {
            // Ignore
          }
          scannerRef.current = null;
          return;
        }

        setIsStarting(false);

        // Check if torch/flashlight is supported
        try {
          const capabilities = scanner.getRunningTrackCapabilities() as MediaTrackCapabilities & {
            torch?: boolean;
          };
          if (capabilities && capabilities.torch) {
            setHasTorch(true);
          } else {
            setHasTorch(false);
          }
        } catch {
          setHasTorch(false);
        }
      } catch (err: unknown) {
        if (!isMountedRef.current) return;
        console.error("Camera start error:", err);
        setIsStarting(false);
        const message =
          err instanceof Error
            ? err.message
            : "Could not access camera. Please check permissions.";
        setCameraError(message);
      }
    },
    [stopScanner, soundEnabled, onScanSuccess, continuousMode, onClose]
  );

  useEffect(() => {
    isMountedRef.current = isOpen;

    if (!isOpen) {
      stopScanner();
      return;
    }

    // Enumerate available cameras
    Html5Qrcode.getCameras()
      .then((devices) => {
        if (!isMountedRef.current) return;
        if (devices && devices.length > 0) {
          setCameras(
            devices.map((d) => ({
              id: d.id,
              label: d.label || `Camera ${d.id}`,
            }))
          );
          // Try to select environment/back camera if found
          const backIndex = devices.findIndex((d) =>
            /back|rear|environment/i.test(d.label)
          );
          const initialIndex = backIndex >= 0 ? backIndex : 0;
          setActiveCameraIndex(initialIndex);
          startScanner(devices[initialIndex].id);
        } else {
          // Fallback to facingMode constraint
          startScanner({ facingMode: "environment" });
        }
      })
      .catch(() => {
        if (!isMountedRef.current) return;
        startScanner({ facingMode: "environment" });
      });

    return () => {
      isMountedRef.current = false;
      stopScanner();
    };
  }, [isOpen, startScanner, stopScanner]);

  const toggleTorch = async () => {
    if (!scannerRef.current || !hasTorch) return;
    try {
      const nextTorch = !torchOn;
      await scannerRef.current.applyVideoConstraints({
        // @ts-expect-error torch is valid in mobile browser video constraints
        advanced: [{ torch: nextTorch }],
      });
      setTorchOn(nextTorch);
    } catch (err) {
      console.warn("Unable to toggle torch:", err);
    }
  };

  const switchCamera = async () => {
    if (cameras.length <= 1) return;
    const nextIndex = (activeCameraIndex + 1) % cameras.length;
    setActiveCameraIndex(nextIndex);
    await startScanner(cameras[nextIndex].id);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    if (soundEnabled) {
      playScanBeep(true);
    }
    onScanSuccess(manualInput.trim());
    setManualInput("");
    if (!continuousMode) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl flex flex-col"
        style={{
          backgroundColor: "#122520",
          border: "1px solid #274A40",
          color: "#F1ECDF",
          maxHeight: "92vh",
        }}
      >
        {/* Top Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: "#274A40" }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: "#1F6F5C", color: "#F1ECDF" }}
            >
              <Camera size={18} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold truncate">
                {title}
              </h3>
              <p className="text-[11px] text-[#B9C9C1] truncate">{subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => setSoundEnabled((s) => !s)}
              title={soundEnabled ? "Mute beep sound" : "Enable beep sound"}
              className="p-2 rounded-lg text-[#B9C9C1] hover:text-white hover:bg-white/10 transition-colors"
            >
              {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-[#B9C9C1] hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Close scanner"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Viewfinder Camera Box */}
        <div className="relative w-full bg-black flex items-center justify-center overflow-hidden min-h-[260px] sm:min-h-[300px]">
          <div id="camera-reader-box" className="w-full h-full" />

          {/* Laser scanning line animation */}
          {!cameraError && !isStarting && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <div className="relative w-[85%] max-w-[360px] h-[150px] sm:h-[180px] border-2 border-[#1F6F5C]/80 rounded-xl overflow-hidden shadow-[0_0_15px_rgba(31,111,92,0.4)]">
                {/* Laser animation */}
                <div
                  className="w-full h-0.5 bg-[#4EE3B8] shadow-[0_0_10px_#4EE3B8] animate-bounce"
                  style={{
                    animationDuration: "2s",
                    animationIterationCount: "infinite",
                  }}
                />
                {/* Corner reticles */}
                <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-[#4EE3B8]" />
                <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-[#4EE3B8]" />
                <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-[#4EE3B8]" />
                <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-[#4EE3B8]" />
              </div>
            </div>
          )}

          {/* Loading or Starting indicator */}
          {isStarting && !cameraError && (
            <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-2 p-4 text-center">
              <div className="w-8 h-8 border-3 border-[#1F6F5C] border-t-[#4EE3B8] rounded-full animate-spin" />
              <p className="text-xs text-[#B9C9C1]">Opening camera...</p>
            </div>
          )}

          {/* Camera Permission / Error message */}
          {cameraError && (
            <div className="absolute inset-0 bg-[#122520]/95 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <AlertCircle size={36} className="text-[#F1D9D3]" />
              <div>
                <p className="text-sm font-semibold text-[#F1D9D3]">
                  Unable to access camera
                </p>
                <p className="text-xs text-[#B9C9C1] mt-1 max-w-xs">
                  {cameraError}
                </p>
                <p className="text-[11px] text-[#B9C9C1]/80 mt-2">
                  Please allow camera permission in your browser or use manual
                  entry below.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => startScanner({ facingMode: "environment" })}
                  className="px-4 py-2 rounded-full text-xs font-semibold bg-[#1F6F5C] text-white hover:bg-[#154F41]"
                >
                  Retry Camera
                </button>
                <button
                  type="button"
                  onClick={() => setShowManual(true)}
                  className="px-4 py-2 rounded-full text-xs font-semibold bg-white/10 text-[#F1ECDF] hover:bg-white/20"
                >
                  Type Barcode
                </button>
              </div>
            </div>
          )}

          {/* Camera controls overlay (Flash & Switch Camera) */}
          {!cameraError && !isStarting && (
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-auto">
              <div className="flex items-center gap-2">
                {hasTorch && (
                  <button
                    type="button"
                    onClick={toggleTorch}
                    className={`p-2.5 rounded-full backdrop-blur-md transition-all ${
                      torchOn
                        ? "bg-[#C98A2C] text-black shadow-lg"
                        : "bg-black/60 text-white hover:bg-black/80"
                    }`}
                    title={torchOn ? "Turn torch off" : "Turn torch on"}
                  >
                    {torchOn ? <Zap size={18} /> : <ZapOff size={18} />}
                  </button>
                )}
                {cameras.length > 1 && (
                  <button
                    type="button"
                    onClick={switchCamera}
                    className="p-2.5 rounded-full bg-black/60 text-white hover:bg-black/80 backdrop-blur-md transition-all"
                    title="Switch camera"
                  >
                    <SwitchCamera size={18} />
                  </button>
                )}
              </div>

              {/* Status pill */}
              <div className="px-3 py-1 rounded-full text-[11px] font-mono font-medium bg-black/60 text-[#D7E9DD] backdrop-blur-md border border-white/10">
                Live Scanner
              </div>
            </div>
          )}
        </div>

        {/* Live Feedback Toast if any */}
        {recentScanFeedback && (
          <div
            className={`px-4 py-2.5 flex items-center gap-2 text-xs font-semibold border-b ${
              recentScanFeedback.isError
                ? "bg-[#331815] text-[#F1D9D3] border-[#8C332A]/50"
                : "bg-[#15382E] text-[#D7E9DD] border-[#1F6F5C]/50"
            }`}
          >
            {recentScanFeedback.isError ? (
              <AlertCircle size={15} className="flex-shrink-0" />
            ) : (
              <CheckCircle2 size={15} className="flex-shrink-0" />
            )}
            <span className="truncate">{recentScanFeedback.text}</span>
          </div>
        )}

        {/* Bottom Options & Controls */}
        <div className="p-3.5 sm:p-4 space-y-3">
          {/* Continuous Multi-Scan Toggle (For rapid POS scanning) */}
          {onToggleContinuousMode && (
            <div
              className="flex items-center justify-between px-3 py-2 rounded-xl"
              style={{
                backgroundColor: "rgba(255,255,255,0.04)",
                border: "1px solid #274A40",
              }}
            >
              <div className="flex items-center gap-2">
                <Layers size={16} className="text-[#4EE3B8]" />
                <div>
                  <div className="text-xs font-semibold">
                    Continuous Multi-Scan
                  </div>
                  <div className="text-[10px] text-[#B9C9C1]">
                    Keep camera open to scan multiple medicines into cart
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onToggleContinuousMode(!continuousMode)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  continuousMode ? "bg-[#1F6F5C]" : "bg-white/20"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    continuousMode ? "translate-x-4" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          )}

          {/* Manual Input Form */}
          {showManual ? (
            <form onSubmit={handleManualSubmit} className="flex gap-2">
              <input
                type="text"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="Type barcode / batch number..."
                autoFocus
                className="flex-1 px-3 py-2 rounded-xl text-xs bg-black/40 border border-[#274A40] text-[#F1ECDF] outline-none focus:border-[#4EE3B8]"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#1F6F5C] hover:bg-[#154F41] text-white"
              >
                Submit
              </button>
              <button
                type="button"
                onClick={() => setShowManual(false)}
                className="px-2 py-2 text-xs text-[#B9C9C1] hover:text-white"
              >
                Cancel
              </button>
            </form>
          ) : (
            <div className="flex items-center justify-between text-xs text-[#B9C9C1]">
              <button
                type="button"
                onClick={() => setShowManual(true)}
                className="inline-flex items-center gap-1.5 hover:text-[#4EE3B8] transition-colors"
              >
                <Keyboard size={14} /> Can&apos;t scan? Enter code manually
              </button>
              <span className="text-[11px] text-[#B9C9C1]/60">
                Supports Barcodes &amp; QR
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
