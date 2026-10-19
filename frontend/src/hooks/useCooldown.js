import { useCallback, useEffect, useRef, useState } from 'react';

export default function useCooldown(defaultSeconds = 60) {
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    return () => clearInterval(timerRef.current);
  }, []);

  const start = useCallback(
    (seconds = defaultSeconds) => {
      setCooldown(seconds);
      clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setCooldown((current) => {
          if (current <= 1) {
            clearInterval(timerRef.current);
            return 0;
          }
          return current - 1;
        });
      }, 1000);
    },
    [defaultSeconds]
  );

  const stop = useCallback(() => {
    clearInterval(timerRef.current);
    setCooldown(0);
  }, []);

  return { cooldown, start, stop };
}
