import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { PLAYER_COLORS } from "../game/gameState";
import type { PlayerColor } from "../game/gameTypes";
import { colorCss, colorLabel } from "../game/playerColors";

export function PanelHeader({ closeLabel = "Close", onClose, title }: { closeLabel?: string; onClose: () => void; title?: string }) {
  return (
    <div className={title ? "panel-header" : "panel-header icon-only"}>
      {title ? <h1>{title}</h1> : null}
      <button className="icon-button" type="button" onClick={onClose} aria-label={closeLabel}>
        <X size={18} />
      </button>
    </div>
  );
}

export function ColorSelect({
  disabled = false,
  label,
  onSelect,
  selectedColor,
}: {
  disabled?: boolean;
  label: string;
  onSelect: (color: PlayerColor) => void;
  selectedColor: PlayerColor | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function closeOnOutsidePress(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, [isOpen]);

  return (
    <div
      className="color-select"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsOpen(false);
        }
      }}
      ref={rootRef}
      style={{ "--selected-color": colorCss(selectedColor) } as CSSProperties}
    >
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={label}
        className="color-select-trigger"
        disabled={disabled}
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span aria-hidden="true" />
      </button>
      {isOpen ? (
        <div className="color-select-menu" role="menu">
          {PLAYER_COLORS.map((color) => (
            <button
              aria-label={colorLabel(color)}
              className={selectedColor === color ? "color-select-option selected" : "color-select-option"}
              key={color}
              onClick={() => {
                onSelect(color);
                setIsOpen(false);
              }}
              role="menuitemradio"
              style={{ "--option-color": colorCss(color) } as CSSProperties}
              type="button"
            >
              <span aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ConfigSelectSection({ children, headingId, title }: { children: ReactNode; headingId: string; title: string }) {
  return (
    <section className="config-section" aria-labelledby={headingId}>
      <h2 id={headingId}>{title}</h2>
      <div className="config-select-row">
        {children}
      </div>
    </section>
  );
}

export function SelectField({
  disabled = false,
  hideLabel = false,
  label,
  onChange,
  options,
  value,
}: {
  disabled?: boolean;
  hideLabel?: boolean;
  label: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  value: string;
}) {
  return (
    <label className="select-field">
      {hideLabel ? null : <span>{label}</span>}
      <select aria-label={label} disabled={disabled} onChange={(event) => onChange(event.target.value)} value={value}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
