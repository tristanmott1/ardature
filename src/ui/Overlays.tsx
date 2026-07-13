import type { ReactNode } from "react";
import { ArrowRight, Check, X } from "lucide-react";

export function HandoffPanel({ ariaLabel, buttonLabel, onContinue }: { ariaLabel: string; buttonLabel: string; onContinue: () => void }) {
  return (
    <div className="modal-scrim handoff-scrim">
      <section className="modal-panel handoff-panel" role="dialog" aria-label={ariaLabel}>
        <button className="primary icon-text-button wide-button" type="button" onClick={onContinue} aria-label={buttonLabel}>
          <ArrowRight size={20} />
        </button>
      </section>
    </div>
  );
}

export function ConfirmSheet({
  ariaLabel,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
  text,
  title,
}: {
  ariaLabel: string;
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  text?: string;
  title: string;
}) {
  return (
    <div className="draft-sheet-scrim">
      <section className="modal-panel draft-sheet" role="dialog" aria-label={ariaLabel}>
        <h2>{title}</h2>
        {text ? <p className="muted">{text}</p> : null}
        <ModalActions>
          <ModalIconButton label={cancelLabel} onClick={onCancel} tone="danger">
            <X size={24} />
          </ModalIconButton>
          <ModalIconButton label={confirmLabel} onClick={onConfirm} tone="primary">
            <Check size={24} />
          </ModalIconButton>
        </ModalActions>
      </section>
    </div>
  );
}

export function NotificationDialog({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="modal-scrim notification-backdrop">
      <section className="modal-panel notification-modal" role="alertdialog" aria-label="Game notification">
        <h2>{message}</h2>
        <ModalActions>
          <ModalIconButton label="Dismiss notification" onClick={onClose} tone="primary">
            <Check size={24} />
          </ModalIconButton>
        </ModalActions>
      </section>
    </div>
  );
}

export function DecisionDialog({
  confirmLabel = "End game",
  message,
  onCancel,
  onConfirm,
}: {
  confirmLabel?: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-scrim">
      <section className="modal-panel decision-modal" role="dialog" aria-label={message}>
        <h2>{message}</h2>
        <ModalActions>
          <ModalIconButton label="Cancel" onClick={onCancel}>
            <X size={24} />
          </ModalIconButton>
          <ModalIconButton label={confirmLabel} onClick={onConfirm} tone="danger">
            <Check size={24} />
          </ModalIconButton>
        </ModalActions>
      </section>
    </div>
  );
}

export function ModalActions({ children }: { children: ReactNode }) {
  return <div className="modal-actions">{children}</div>;
}

export function ModalIconButton({
  children,
  label,
  onClick,
  tone = "plain",
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  tone?: "danger" | "plain" | "primary";
}) {
  const toneClass = tone === "plain" ? "" : ` ${tone}`;

  return (
    <button className={`icon-button${toneClass} large`} type="button" onClick={onClick} aria-label={label}>
      {children}
    </button>
  );
}
