/**
 * useGeolocation — browser location permission state machine
 *
 * Status transitions:
 *   idle → requesting → granted   (success path)
 *   idle → requesting → denied    (user blocked)
 *   idle → requesting → unavailable  (timeout / API not present)
 *   idle → denied (pre-check via Permissions API, no prompt shown)
 *   idle → granted + auto-fetch (Permissions API says already granted)
 *
 * The hook checks the current permission state on mount via the Permissions API
 * WITHOUT prompting the user.  Only `request()` triggers the native prompt.
 */

import { useState, useEffect, useCallback } from 'react';

const GEO_OPTS = {
  enableHighAccuracy: false,
  timeout:            12_000,
  maximumAge:         5 * 60_000, // accept cached position up to 5 min old
};

export function useGeolocation() {
  const [status, setStatus]   = useState('idle');     // idle|requesting|granted|denied|unavailable
  const [coords, setCoords]   = useState(null);       // { lat, lng }
  const [error,  setError]    = useState(null);       // string | null

  // Trigger native geolocation prompt
  const request = useCallback(() => {
    if (!navigator.geolocation) {
      setStatus('unavailable');
      setError('Geolocation API לא נתמך בדפדפן זה.');
      return;
    }
    setStatus('requesting');
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setStatus('granted');
      },
      (err) => {
        setStatus(err.code === 1 ? 'denied' : 'unavailable');
        setError(err.message);
      },
      GEO_OPTS,
    );
  }, []);

  // On mount: check permission state silently, auto-fetch if already granted
  useEffect(() => {
    if (!navigator.geolocation) {
      setStatus('unavailable');
      return;
    }

    if (navigator.permissions) {
      navigator.permissions
        .query({ name: 'geolocation' })
        .then((result) => {
          if (result.state === 'granted') {
            // Already permitted — auto-fetch without showing a prompt
            request();
          } else if (result.state === 'denied') {
            setStatus('denied');
          }
          // 'prompt' → leave as 'idle'; user must call request() intentionally
        })
        .catch(() => {
          // Permissions API not available — leave 'idle'
        });
    }
  }, [request]);

  return { status, coords, error, request };
}
