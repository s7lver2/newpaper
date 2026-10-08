import { useCallback, useEffect, useState } from 'react';
import { commands } from '../ipc/commands';
import { onSettingsChanged } from '../ipc/events';

export function useSetting<T>(key: string, fallback: T): [T, (v: T) => Promise<void>] {
  const [value, setValue] = useState<T>(fallback);
  useEffect(() => {
    let alive = true;
    commands.settingsGet<T>(key).then((v) => alive && v !== null && v !== undefined && setValue(v));
    const off = onSettingsChanged((e) => {
      if (e.key === key) setValue((e.value ?? fallback) as T);
    });
    return () => {
      alive = false;
      off.then((f) => f());
    };
    // `fallback` se ignora a propósito tras el primer render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const set = useCallback(
    async (v: T) => {
      setValue(v);
      await commands.settingsSet(key, v);
    },
    [key],
  );
  return [value, set];
}
