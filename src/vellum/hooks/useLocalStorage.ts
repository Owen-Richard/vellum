import { useState, useCallback, useRef } from 'react';
import { readStored, writeStored } from '../../extension/storage';

// Keep the source hook API; persistence belongs to the extension, not the host.
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => readStored(key, initialValue));
  const current = useRef(storedValue);
  const setValue = useCallback((value: T | ((prev: T) => T)) => {
    const next = value instanceof Function ? value(current.current) : value;
    current.current = next;
    setStoredValue(next);
    writeStored(key, next);
  }, [key]);
  return [storedValue, setValue];
}
