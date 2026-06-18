'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/app/providers';
import { useRouter } from 'next/navigation';
import jsQR from 'jsqr';
import { QrCode, Camera, Upload, AlertCircle, CheckCircle, XCircle, RefreshCw, Clipboard } from 'lucide-react';
import { API_URL } from '@/config';

interface ScanResult {
  valid: boolean;
  message: string;
  code?: string;
  scannedAt?: string;
  ticketDetails?: {
    ticketId?: string;
    buyerEmail: string;
    eventTitle: string;
    tierName: string;
    scannedAt?: string;
  };
}

export default function TicketScannerPage() {
  const { token, user } = useAuth();
  const router = useRouter();

  // Redirect if not logged in as organizer or staff
  useEffect(() => {
    if (!user) {
      router.push('/login');
    } else if (user.role !== 'organizer' && user.role !== 'staff') {
      router.push('/');
    }
  }, [user]);

  // UI States
  const [scanMethod, setScanMethod] = useState<'camera' | 'upload' | 'manual'>('camera');
  const [scanning, setScanning] = useState(false);
  const [manualPayload, setManualPayload] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Video Ref for QR code stream
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // 1. Camera Initialization
  const startCamera = async () => {
    setCameraError(null);
    setScanning(true);
    setStatus('idle');
    setResult(null);
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.play();
        requestAnimationFrame(tick);
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      setCameraError('Could not access camera. Try the file-upload or manual paste fallback.');
      setScanning(false);
    }
  };

  const stopCamera = () => {
    setScanning(false);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  // QR Scanning Loop from video stream
  const tick = () => {
    if (!scanning || !videoRef.current || !canvasRef.current) return;

    if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (context) {
        canvas.height = videoRef.current.videoHeight;
        canvas.width = videoRef.current.videoWidth;
        context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });

        if (code) {
          // QR Code Found! Stop camera and send to API
          stopCamera();
          submitScan(code.data);
          return;
        }
      }
    }
    if (scanning) {
      requestAnimationFrame(tick);
    }
  };

  // Stop camera on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // 2. File Upload Scanning
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (context) {
          canvas.width = image.width;
          canvas.height = image.height;
          context.drawImage(image, 0, 0);
          const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          
          if (code) {
            submitScan(code.data);
          } else {
            alert('Could not find a valid QR Code in this image.');
          }
        }
      };
      image.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // 3. API Submission
  const submitScan = async (payload: string) => {
    setStatus('loading');
    setResult(null);

    try {
      const res = await fetch(`${API_URL}/api/tickets/scan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ qr_payload: payload }),
      });

      const data = await res.json();
      
      if (res.status === 400 && data.code === 'INVALID_SIGNATURE') {
        // Counterfeit QR Code
        setResult({
          valid: false,
          message: data.message,
          code: data.code
        });
        setStatus('error');
      } else if (!res.ok) {
        throw new Error(data.error || 'Failed to scan ticket');
      } else {
        // Successful API Response
        setResult(data);
        setStatus(data.valid ? 'success' : 'error');
      }
    } catch (err: any) {
      console.error('Scan submission error:', err);
      alert(err.message || 'An error occurred during verification');
      setStatus('idle');
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualPayload.trim()) {
      submitScan(manualPayload.trim());
    }
  };

  const resetScanner = () => {
    setStatus('idle');
    setResult(null);
    setManualPayload('');
    if (scanMethod === 'camera') {
      startCamera();
    }
  };

  const switchMethod = (method: 'camera' | 'upload' | 'manual') => {
    stopCamera();
    setScanMethod(method);
    setResult(null);
    setStatus('idle');
    if (method === 'camera') {
      // Small timeout to let elements mount
      setTimeout(startCamera, 100);
    }
  };

  return (
    <div className="flex-1 max-w-xl mx-auto w-full px-4 py-12 flex flex-col justify-center">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-extrabold text-white flex items-center justify-center gap-2 mb-2">
          <QrCode className="w-8 h-8 text-indigo-500" />
          Staff Scan Portal
        </h1>
        <p className="text-zinc-400 text-sm">Validate entry tickets and verify cryptographic HMAC signatures in real time.</p>
      </div>

      {/* Tabs */}
      <div className="flex bg-zinc-900 border border-zinc-800 rounded-xl p-1 mb-8">
        <button
          onClick={() => switchMethod('camera')}
          className={`flex-1 py-2 text-xs sm:text-sm font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
            scanMethod === 'camera' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-zinc-300'
          }`}
        >
          <Camera className="w-4 h-4" />
          Webcam
        </button>
        <button
          onClick={() => switchMethod('upload')}
          className={`flex-1 py-2 text-xs sm:text-sm font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
            scanMethod === 'upload' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-zinc-300'
          }`}
        >
          <Upload className="w-4 h-4" />
          Upload Image
        </button>
        <button
          onClick={() => switchMethod('manual')}
          className={`flex-1 py-2 text-xs sm:text-sm font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
            scanMethod === 'manual' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-zinc-300'
          }`}
        >
          <Clipboard className="w-4 h-4" />
          Paste Key
        </button>
      </div>

      {/* Content Section */}
      <div className="glass-premium border border-zinc-800 rounded-2xl p-6 shadow-2xl relative overflow-hidden min-h-[350px] flex flex-col justify-center">
        <canvas ref={canvasRef} className="hidden" />

        {status === 'loading' && (
          <div className="text-center py-12">
            <RefreshCw className="w-12 h-12 text-indigo-500 mx-auto animate-spin mb-4" />
            <p className="text-zinc-300 font-bold">Verifying Signature...</p>
            <p className="text-zinc-550 text-xs mt-1 font-mono">Running DB validation</p>
          </div>
        )}

        {status === 'idle' && (
          <>
            {/* Camera Scanner View */}
            {scanMethod === 'camera' && (
              <div className="flex flex-col items-center">
                {cameraError ? (
                  <div className="text-center text-red-400 p-6">
                    <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <p className="text-sm font-semibold">{cameraError}</p>
                  </div>
                ) : (
                  <div className="w-full space-y-4">
                    <div className="relative aspect-square max-w-[280px] mx-auto rounded-xl overflow-hidden border-2 border-dashed border-indigo-500/50 bg-black flex items-center justify-center">
                      {scanning ? (
                        <>
                          <video ref={videoRef} className="w-full h-full object-cover" />
                          <div className="absolute inset-x-4 top-1/2 h-0.5 bg-red-500 shadow-[0_0_10px_#ef4444] animate-bounce" />
                        </>
                      ) : (
                        <button
                          onClick={startCamera}
                          className="flex flex-col items-center gap-2 text-zinc-400 hover:text-white transition-colors"
                        >
                          <Camera className="w-8 h-8" />
                          <span className="text-xs font-semibold">Start Camera Stream</span>
                        </button>
                      )}
                    </div>
                    {scanning && (
                      <button
                        onClick={stopCamera}
                        className="w-full py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-xl text-xs font-semibold transition-colors"
                      >
                        Stop Stream
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* File Upload View */}
            {scanMethod === 'upload' && (
              <div className="text-center py-10">
                <label className="border-2 border-dashed border-zinc-800 hover:border-zinc-700 bg-zinc-950/60 p-8 rounded-xl cursor-pointer flex flex-col items-center group transition-colors max-w-[300px] mx-auto">
                  <Upload className="w-10 h-10 text-zinc-500 group-hover:text-indigo-400 transition-colors mb-4" />
                  <span className="text-sm font-semibold text-zinc-300">Upload ticket QR image</span>
                  <span className="text-xs text-zinc-550 mt-1">Supports PNG, JPG, or PDF snapshot</span>
                  <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                </label>
              </div>
            )}

            {/* Manual Paste View */}
            {scanMethod === 'manual' && (
              <form onSubmit={handleManualSubmit} className="space-y-4 max-w-sm mx-auto w-full">
                <div>
                  <label className="block text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-2">QR Payload String</label>
                  <textarea
                    required
                    rows={4}
                    placeholder='{"ticket_id":"...","event_id":"...","tier_id":"...","hmac_signature":"..."}'
                    value={manualPayload}
                    onChange={(e) => setManualPayload(e.target.value)}
                    className="w-full p-3 bg-zinc-950 border border-zinc-800 focus:border-indigo-500 rounded-xl text-white outline-none text-xs font-mono placeholder-zinc-700 transition-colors"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm transition-colors"
                >
                  Verify Signature Payload
                </button>
              </form>
            )}
          </>
        )}

        {/* Scan Result Feedback View */}
        {(status === 'success' || status === 'error') && result && (
          <div className="text-center space-y-6">
            
            {/* Header Status Icon */}
            {result.valid ? (
              <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-8 h-8" />
              </div>
            ) : (
              <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 text-red-400 rounded-full flex items-center justify-center mx-auto">
                <XCircle className="w-8 h-8" />
              </div>
            )}

            {/* Verification Status message */}
            <div>
              <h3 className={`text-2xl font-extrabold tracking-tight ${result.valid ? 'text-emerald-400' : 'text-red-400'}`}>
                {result.valid ? 'Access Granted' : 'Access Denied'}
              </h3>
              <p className="text-zinc-200 text-base font-bold mt-1">{result.message}</p>
            </div>

            {/* Ticket details if present */}
            {result.ticketDetails && (
              <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-850 text-left space-y-2.5 max-w-sm mx-auto text-xs">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Event</span>
                  <span className="text-white font-bold">{result.ticketDetails.eventTitle}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Tier</span>
                  <span className="text-indigo-400 font-bold">{result.ticketDetails.tierName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Buyer</span>
                  <span className="text-white font-mono">{result.ticketDetails.buyerEmail}</span>
                </div>
                {result.ticketDetails.scannedAt && (
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Scanned At</span>
                    <span className="text-zinc-400 font-mono">
                      {new Date(result.ticketDetails.scannedAt).toLocaleString()}
                    </span>
                  </div>
                )}
                {result.ticketDetails.ticketId && (
                  <div className="border-t border-zinc-850 pt-2 flex flex-col gap-0.5">
                    <span className="text-zinc-650 font-mono text-[9px]">ID</span>
                    <span className="text-zinc-550 font-mono text-[9px] break-all">{result.ticketDetails.ticketId}</span>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={resetScanner}
              className="px-6 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded-xl text-sm font-semibold transition-colors inline-flex items-center gap-1.5"
            >
              Scan Next Ticket
            </button>

          </div>
        )}
      </div>
    </div>
  );
}
