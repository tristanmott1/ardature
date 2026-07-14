import { type PointerEvent as ReactPointerEvent } from "react";
import { Check, GripVertical, Plus, ScanLine, Shuffle, Trash2, Unlock, Users, Wifi } from "lucide-react";
import {
  ALLOCATION_STYLES,
  ATTACK_STYLES,
  PICK_TIME_LIMITS,
  TROOP_ALLOCATION_TIME_LIMITS,
  formatTimerOption,
  formatTroopTimerOption,
} from "../game/gameState";
import type {
  AllocationStyle,
  AttackStyle,
  DraftStyle,
  GameConfig,
  GamePlayer,
  PickTimeLimit,
  PlayerColor,
  TroopAllocationTimeLimit,
} from "../game/gameTypes";
import type { SyncRole } from "../game/gameView";
import { QrPanel } from "../sync/QrCodeUi";
import type { SyncRecoveryPlayerSlot } from "../sync/syncTransport";
import { ColorSelect, ConfigSelectSection, PanelHeader, SelectField } from "./FormControls";
import { PlayerIdentity } from "./PlayerChrome";

const DRAFT_STYLE_LABELS: Record<DraftStyle, string> = {
  random: "Random",
  roundRobin: "Round Robin",
  snake: "Snake",
};

const ALLOCATION_STYLE_LABELS: Record<AllocationStyle, string> = {
  manual: "Manual",
  random: "Random",
};

const ATTACK_STYLE_LABELS: Record<AttackStyle, string> = {
  challenge: "Challenge",
  regular: "Regular",
};

export function HomePanel({ onStartLocal, onStartSync }: { onStartLocal: () => void; onStartSync: () => void }) {
  return (
    <section className="hud-panel home-panel">
      <div className="brand-row">
        <img src="./app-icons/icon-192.png" alt="" />
        <div>
          <h1>Ardatúrë</h1>
        </div>
      </div>
      <div className="mode-grid">
        <button className="primary icon-text-button" type="button" onClick={onStartLocal}>
          <Users size={20} />
          Local
        </button>
        <button className="secondary icon-text-button" type="button" onClick={onStartSync}>
          <Wifi size={20} />
          Sync
        </button>
      </div>
    </section>
  );
}

export function SyncEntryPanel({
  color,
  message,
  name,
  onBack,
  onColorChange,
  onChooseRecoveryPlayer,
  onHost,
  onNameChange,
  onScan,
  recoverySlots,
}: {
  color: PlayerColor | null;
  message: string;
  name: string;
  onBack: () => void;
  onColorChange: (color: PlayerColor) => void;
  onChooseRecoveryPlayer: (slot: SyncRecoveryPlayerSlot) => void;
  onHost: () => void;
  onNameChange: (name: string) => void;
  onScan: () => void;
  recoverySlots: SyncRecoveryPlayerSlot[];
}) {
  const ready = Boolean(name.trim() && color);
  const isRecovery = recoverySlots.length > 0 || message === "No disconnected players";

  return (
    <section className="hud-panel sync-entry-panel">
      <PanelHeader onClose={onBack} />
      {isRecovery ? (
        <div className="recovery-slot-list">
          {recoverySlots.map((slot) => (
            <button className="secondary recovery-slot-button wide-button" type="button" key={slot.id} onClick={() => onChooseRecoveryPlayer(slot)}>
              <PlayerIdentity color={slot.color} name={slot.name} />
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="sync-player-entry-row">
            <input
              aria-label="Sync player name"
              autoComplete="off"
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="Name"
              value={name}
            />
            <ColorSelect
              label="Sync player color"
              selectedColor={color}
              onSelect={onColorChange}
            />
          </div>
          <div className="mode-grid">
            <button className="primary icon-text-button" type="button" onClick={onHost} disabled={!ready}>
              <Wifi size={19} />
              Host
            </button>
            <button className="secondary icon-text-button" type="button" onClick={onScan} disabled={!ready}>
              <ScanLine size={19} />
              Join
            </button>
          </div>
        </>
      )}
      {message ? <p className="sync-status">{message}</p> : null}
    </section>
  );
}

export function SetupPanel({
  canControl,
  canStart,
  config,
  draggingPlayerId,
  draftName,
  localPlayerId,
  mode,
  onAddPlayer,
  onBeginDrag,
  onBack,
  onDraftNameChange,
  onRandomizePlayers,
  onRemovePlayer,
  onScanAnswer,
  onStartDraft,
  onUnlockPlayerField,
  onUpdateConfig,
  onUpdatePlayer,
  players,
  syncAnswerText,
  syncMessage,
  syncQrText,
  syncRole,
}: {
  canControl: boolean;
  canStart: boolean;
  config: GameConfig;
  draggingPlayerId: string | null;
  draftName: string;
  localPlayerId: string | null;
  mode: "local" | "sync";
  onAddPlayer: () => void;
  onBeginDrag: (event: ReactPointerEvent<HTMLButtonElement>, playerId: string) => void;
  onBack: () => void;
  onDraftNameChange: (name: string) => void;
  onRandomizePlayers: () => void;
  onRemovePlayer: (playerId: string) => void;
  onScanAnswer: () => void;
  onStartDraft: () => void;
  onUnlockPlayerField: (playerId: string, field: "name" | "color") => void;
  onUpdateConfig: (updates: Partial<GameConfig>) => void;
  onUpdatePlayer: (playerId: string, updates: Partial<GamePlayer>) => void;
  players: GamePlayer[];
  syncAnswerText: string;
  syncMessage: string;
  syncQrText: string;
  syncRole: SyncRole;
}) {
  return (
    <section className="hud-panel setup-panel">
      <PanelHeader onClose={onBack} />

      {mode === "local" ? (
        <form
          className="add-player"
          onSubmit={(event) => {
            event.preventDefault();
            onAddPlayer();
          }}
        >
          <input
            aria-label="Player name"
            autoComplete="off"
            onChange={(event) => onDraftNameChange(event.target.value)}
            placeholder="Name"
            value={draftName}
          />
          <button className="icon-button primary" type="submit" disabled={!draftName.trim() || players.length >= 6} aria-label="Add player">
            <Plus size={18} />
          </button>
        </form>
      ) : null}

      {mode === "sync" && syncRole === "host" ? (
        <div className="sync-lobby-tools">
          {syncQrText ? <QrPanel text={syncQrText} /> : null}
          <button className="secondary icon-text-button scan-answer-button" type="button" onClick={onScanAnswer}>
            <ScanLine size={18} />
            Scan
          </button>
        </div>
      ) : null}

      {mode === "sync" && syncRole === "joiner" && syncAnswerText ? (
        <QrPanel text={syncAnswerText} />
      ) : null}

      {syncMessage ? <p className="sync-status">{syncMessage}</p> : null}

      <div className="player-list">
        {players.map((player) => {
          const canEditPlayer = mode === "local" || canControl || player.id === localPlayerId;
          const nameLocked = mode === "sync" && !canControl && player.nameLocked;
          const colorLocked = mode === "sync" && !canControl && player.colorLocked;

          return (
            <article
              className={draggingPlayerId === player.id ? "player-row dragging" : "player-row"}
              data-player-id={player.id}
              data-player-status={player.connectionStatus}
              key={player.id}
            >
              <button
                className="drag-handle"
                type="button"
                onPointerDown={(event) => onBeginDrag(event, player.id)}
                disabled={!canControl}
                aria-label={`Move ${player.name}`}
              >
                <GripVertical size={18} />
              </button>
              <input
                aria-label={`${player.name || "Player"} name`}
                autoComplete="off"
                disabled={!canEditPlayer || nameLocked}
                onChange={(event) => onUpdatePlayer(player.id, { name: event.target.value })}
                value={player.name}
              />
              {canControl && player.nameLocked ? (
                <button className="icon-button" type="button" onClick={() => onUnlockPlayerField(player.id, "name")} aria-label={`Unlock ${player.name} name`}>
                  <Unlock size={15} />
                </button>
              ) : null}
              <ColorSelect
                disabled={!canEditPlayer || colorLocked}
                label={`${player.name || "Player"} color`}
                selectedColor={player.color}
                onSelect={(color) => onUpdatePlayer(player.id, { color })}
              />
              {canControl && player.colorLocked ? (
                <button className="icon-button" type="button" onClick={() => onUnlockPlayerField(player.id, "color")} aria-label={`Unlock ${player.name} color`}>
                  <Unlock size={15} />
                </button>
              ) : null}
              {mode === "local" || canControl ? (
                player.id === localPlayerId ? (
                  <span className="icon-button-spacer" aria-hidden="true" />
                ) : (
                  <button className="icon-button danger" type="button" onClick={() => onRemovePlayer(player.id)} aria-label={`Remove ${player.name || "player"}`}>
                    <Trash2 size={16} />
                  </button>
                )
              ) : null}
            </article>
          );
        })}
      </div>

      {mode === "local" || (mode === "sync" && syncRole === "host") ? (
        <div className="setup-actions">
          <button className="secondary icon-text-button" type="button" onClick={onRandomizePlayers} disabled={!canControl || players.length < 2}>
            <Shuffle size={18} />
            Randomize
          </button>
        </div>
      ) : null}

      <div className="config-grid">
        <ConfigSelectSection headingId="territory-draft-heading" title="Territory Draft">
          <SelectField
            disabled={!canControl}
            hideLabel
            label="Draft style"
            options={(["snake", "roundRobin", "random"] as DraftStyle[]).map((value) => ({ value, label: DRAFT_STYLE_LABELS[value] }))}
            value={config.draftStyle}
            onChange={(value) => onUpdateConfig({ draftStyle: value as DraftStyle })}
          />
          <SelectField
            disabled={!canControl || config.draftStyle === "random"}
            hideLabel
            label="Pick time"
            options={PICK_TIME_LIMITS.map((value) => ({ value: String(value), label: formatTimerOption(value) }))}
            value={String(config.pickTimeLimit)}
            onChange={(value) => onUpdateConfig({ pickTimeLimit: Number(value) as PickTimeLimit })}
          />
        </ConfigSelectSection>
        <ConfigSelectSection headingId="troop-allocation-heading" title="Troop Allocation">
          <SelectField
            disabled={!canControl}
            hideLabel
            label="Allocation style"
            options={ALLOCATION_STYLES.map((value) => ({ value, label: ALLOCATION_STYLE_LABELS[value] }))}
            value={config.allocationStyle}
            onChange={(value) => onUpdateConfig({ allocationStyle: value as AllocationStyle })}
          />
          <SelectField
            disabled={!canControl || config.allocationStyle === "random"}
            hideLabel
            label="Allocation time"
            options={TROOP_ALLOCATION_TIME_LIMITS.map((value) => ({ value: String(value), label: formatTroopTimerOption(value) }))}
            value={String(config.troopAllocationTimeLimit)}
            onChange={(value) => onUpdateConfig({ troopAllocationTimeLimit: Number(value) as TroopAllocationTimeLimit })}
          />
        </ConfigSelectSection>
        <ConfigSelectSection headingId="attack-style-heading" title="Attack Style">
          <SelectField
            disabled={!canControl}
            hideLabel
            label="Attack style"
            options={ATTACK_STYLES.map((value) => ({ value, label: ATTACK_STYLE_LABELS[value] }))}
            value={config.attackStyle}
            onChange={(value) => onUpdateConfig({ attackStyle: value as AttackStyle })}
          />
        </ConfigSelectSection>
      </div>

      {canControl ? (
        <button className="primary icon-text-button wide-button" type="button" onClick={onStartDraft} disabled={!canStart} aria-label="Start game">
          <Check size={20} />
        </button>
      ) : null}
    </section>
  );
}
