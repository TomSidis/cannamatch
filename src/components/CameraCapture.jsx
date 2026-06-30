/**
 * CameraCapture — live rear-camera capture (Layer 4.1).
 *
 * "צלם עכשיו" → getUserMedia({ facingMode: 'environment' }). On capture, snapshots
 * the video frame to a JPEG Blob and calls onCapture(blob). If the camera API is
 * unavailable or permission is DENIED, calls onFallback() so the caller can open the
 * file picker instead — the user is never dead-ended.
 *
 * getUserMedia requires HTTPS (secure context) — relevant for the Layer 7 deploy.
 */
import { useRef, useState, useEffect, useCallback } from 'react';

export default function CameraCapture({ onCapture, onFallback, accent = '#4ADE80' }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [active, setActive] = useState(false);
  const [err, setErr] = useState(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setActive(false);
  }, []);

  useEffect(() => () => stop(), [stop]); // stop the stream on unmount

  const start = async () => {
    setErr(null);
    if (!navigator.mediaDevices?.getUserMedia) { onFallback?.(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } }, audio: false,
      });
      streamRef.current = stream;
      setActive(true);
      // assign after render so the <video> exists
      requestAnimationFrame(() => { if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play?.(); } });
    } catch {
      // permission denied / no camera → fall back to file upload
      setErr('אין גישה למצלמה — אפשר להעלות תמונה במקום');
      onFallback?.();
    }
  };

  const snap = () => {
    const video = videoRef.current;
    if (!video) return;
    const w = video.videoWidth || 1280, h = video.videoHeight || 720;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(video, 0, 0, w, h);
    canvas.toBlob((blob) => { if (blob) onCapture?.(blob); }, 'image/jpeg', 0.85);
    stop();
  };

  if (!active) {
    return (
      <div>
        <button onClick={start}
          className="font-bold text-sm px-4 py-2 rounded-xl border"
          style={{ borderColor: accent, color: accent, background: 'transparent' }}>
          📷 צלם עכשיו
        </button>
        {err && <p className="text-xs mt-1" style={{ color: '#FCA5A5' }}>{err}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: `1.5px solid ${accent}55` }}>
      <video ref={videoRef} playsInline muted style={{ width: '100%', display: 'block', background: '#000' }} />
      <div className="flex gap-2 p-2">
        <button onClick={snap} className="flex-1 py-2 rounded-lg font-bold text-sm"
          style={{ background: accent, color: '#061006' }}>📸 צלם דף</button>
        <button onClick={stop} className="px-4 py-2 rounded-lg font-bold text-sm border"
          style={{ borderColor: accent, color: accent }}>ביטול</button>
      </div>
    </div>
  );
}
