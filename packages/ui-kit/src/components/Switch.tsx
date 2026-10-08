import { useId, type ReactNode } from 'react';

export function Switch(props: { checked: boolean; onChange(next: boolean): void; label: string; description?: ReactNode; disabled?: boolean; id?: string }) {
  const auto = useId();
  const id = props.id ?? auto;
  return (
    <div className="np-switch-row">
      <span className="np-switch-text">
        <span id={`${id}-label`} className="np-switch-label">{props.label}</span>
        {props.description ? <span id={`${id}-desc`} className="np-switch-desc">{props.description}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={props.checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={props.description ? `${id}-desc` : undefined}
        disabled={props.disabled}
        className="np-switch"
        onClick={() => props.onChange(!props.checked)}
      >
        <span className="np-switch-thumb" aria-hidden="true" />
      </button>
    </div>
  );
}