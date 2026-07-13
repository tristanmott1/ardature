import {
  compressToEncodedURIComponent,
  compressToUint8Array,
  decompressFromEncodedURIComponent,
  decompressFromUint8Array,
} from "lz-string";
import type { PlayerColor } from "../game/gameTypes";

const RECOVERY_PLAYER_COLORS: PlayerColor[] = ["green", "blue", "yellow", "red", "purple", "black"];

export type SyncWireMessage = {
  type: string;
  [key: string]: unknown;
};

export type SyncConnectionStatus = "connected" | "reconnecting" | "gone";

export type SyncOfferPayload = {
  kind: "ardature-sync-offer";
  version: 1;
  roomId: string;
  offerId: string;
  hostPlayerId: string;
  hostName: string;
  hostColor: PlayerColor;
  sdp: RTCSessionDescriptionInit;
};

export type SyncAnswerPayload = {
  kind: "ardature-sync-answer";
  version: 1;
  roomId: string;
  offerId: string;
  playerId: string;
  playerName: string;
  playerColor: PlayerColor;
  sdp: RTCSessionDescriptionInit;
};

export type SyncRecoveryPlayerSlot = {
  id: string;
  name: string;
  color: PlayerColor;
};

export type SyncRecoveryOfferPayload = {
  kind: "ardature-sync-recovery-offer";
  version: 1;
  roomId: string;
  offerId: string;
  hostPlayerId: string;
  hostName: string;
  hostColor: PlayerColor;
  disconnectedPlayers: SyncRecoveryPlayerSlot[];
  sdp: RTCSessionDescriptionInit;
};

export type SyncRecoveryAnswerPayload = {
  kind: "ardature-sync-recovery-answer";
  version: 1;
  roomId: string;
  offerId: string;
  playerId: string;
  playerName: string;
  playerColor: PlayerColor;
  sdp: RTCSessionDescriptionInit;
};

type PendingOffer = {
  channel: RTCDataChannel;
  peerConnection: RTCPeerConnection;
};

type HostPeer = {
  channel: RTCDataChannel;
  closedNotified: boolean;
  heartbeatInterval: number;
  lastHeardAt: number;
  peerConnection: RTCPeerConnection;
  playerName: string;
  reconnectTimer: number;
  status: SyncConnectionStatus;
};

type SyncTransportCallbacks = {
  onPeerClosed?: (playerId: string) => void;
  onPeerOpen?: (playerId: string) => void;
  onPeerStatus?: (playerId: string, status: SyncConnectionStatus) => void;
  onMessage?: (playerId: string, message: SyncWireMessage) => void;
};

const CHANNEL_NAME = "ardature";
const ICE_TIMEOUT_MS = 5000;
const HEARTBEAT_INTERVAL_MS = 1000;
const HEARTBEAT_TIMEOUT_MS = 3000;
const DEFAULT_RECONNECT_GRACE_MS = 10000;
const HEARTBEAT_PING = "__ardatureHeartbeat";
const HEARTBEAT_PONG = "__ardatureHeartbeatAck";
const COMPACT_OFFER_PREFIX = "ARO:";
const COMPACT_ANSWER_PREFIX = "ARA:";
const COMPACT_RECOVERY_OFFER_PREFIX = "ARR:";
const COMPACT_RECOVERY_ANSWER_PREFIX = "ARY:";
const QR_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

function createPeerConnection() {
  return new RTCPeerConnection({ iceServers: [] });
}

function waitForIceGathering(peerConnection: RTCPeerConnection) {
  if (peerConnection.iceGatheringState === "complete") {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const timeout = window.setTimeout(done, ICE_TIMEOUT_MS);

    function done() {
      window.clearTimeout(timeout);
      peerConnection.removeEventListener("icegatheringstatechange", handleChange);
      resolve();
    }

    function handleChange() {
      if (peerConnection.iceGatheringState === "complete") {
        done();
      }
    }

    peerConnection.addEventListener("icegatheringstatechange", handleChange);
  });
}

function waitForChannelOpen(channel: RTCDataChannel) {
  if (channel.readyState === "open") {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Connection did not open."));
    }, 6000);

    function cleanup() {
      window.clearTimeout(timeout);
      channel.removeEventListener("open", handleOpen);
      channel.removeEventListener("close", handleClose);
      channel.removeEventListener("error", handleClose);
    }

    function handleOpen() {
      cleanup();
      resolve();
    }

    function handleClose() {
      cleanup();
      reject(new Error("Connection closed before opening."));
    }

    channel.addEventListener("open", handleOpen);
    channel.addEventListener("close", handleClose);
    channel.addEventListener("error", handleClose);
  });
}

function encodeBase45(bytes: Uint8Array) {
  let encoded = "";

  for (let index = 0; index < bytes.length; index += 2) {
    if (index + 1 >= bytes.length) {
      const value = bytes[index];

      encoded += QR_ALPHABET[value % 45];
      encoded += QR_ALPHABET[Math.floor(value / 45)];
      continue;
    }

    const value = bytes[index] * 256 + bytes[index + 1];

    encoded += QR_ALPHABET[value % 45];
    encoded += QR_ALPHABET[Math.floor(value / 45) % 45];
    encoded += QR_ALPHABET[Math.floor(value / 2025)];
  }

  return encoded;
}

function decodeBase45(value: string) {
  const bytes: number[] = [];

  for (let index = 0; index < value.length; ) {
    const remaining = value.length - index;

    if (remaining === 1) {
      return null;
    }

    if (remaining === 2) {
      const first = QR_ALPHABET.indexOf(value[index]);
      const second = QR_ALPHABET.indexOf(value[index + 1]);

      if (first < 0 || second < 0) {
        return null;
      }

      const byte = first + second * 45;

      if (byte > 255) {
        return null;
      }

      bytes.push(byte);
      index += 2;
      continue;
    }

    const first = QR_ALPHABET.indexOf(value[index]);
    const second = QR_ALPHABET.indexOf(value[index + 1]);
    const third = QR_ALPHABET.indexOf(value[index + 2]);

    if (first < 0 || second < 0 || third < 0) {
      return null;
    }

    const pair = first + second * 45 + third * 2025;

    if (pair > 65535) {
      return null;
    }

    bytes.push(Math.floor(pair / 256), pair % 256);
    index += 3;
  }

  return new Uint8Array(bytes);
}

function encodeCompactPayload(prefix: string, fields: string[]) {
  return `${prefix}${encodeBase45(compressToUint8Array(JSON.stringify(fields)))}`;
}

function parseCompactPayload(value: string) {
  const isOffer = value.startsWith(COMPACT_OFFER_PREFIX);
  const isAnswer = value.startsWith(COMPACT_ANSWER_PREFIX);
  const isRecoveryOffer = value.startsWith(COMPACT_RECOVERY_OFFER_PREFIX);
  const isRecoveryAnswer = value.startsWith(COMPACT_RECOVERY_ANSWER_PREFIX);

  if (!isOffer && !isAnswer && !isRecoveryOffer && !isRecoveryAnswer) {
    return null;
  }

  const prefix = isOffer
    ? COMPACT_OFFER_PREFIX
    : isAnswer
      ? COMPACT_ANSWER_PREFIX
      : isRecoveryOffer
        ? COMPACT_RECOVERY_OFFER_PREFIX
        : COMPACT_RECOVERY_ANSWER_PREFIX;
  const bytes = decodeBase45(value.slice(prefix.length));
  const decompressed = bytes ? decompressFromUint8Array(bytes) : null;
  const fields = decompressed ? (JSON.parse(decompressed) as unknown) : null;

  if (!Array.isArray(fields) || fields.some((field) => typeof field !== "string")) {
    return null;
  }

  if (isOffer && fields.length === 6) {
    const [roomId, offerId, hostPlayerId, hostName, hostColor, sdp] = fields;

    if (!RECOVERY_PLAYER_COLORS.includes(hostColor as PlayerColor)) {
      return null;
    }

    return {
      kind: "ardature-sync-offer",
      version: 1,
      roomId,
      offerId,
      hostPlayerId,
      hostName,
      hostColor: hostColor as PlayerColor,
      sdp: { type: "offer", sdp },
    } satisfies SyncOfferPayload;
  }

  if (isAnswer && fields.length === 6) {
    const [roomId, offerId, playerId, playerName, playerColor, sdp] = fields;

    if (!RECOVERY_PLAYER_COLORS.includes(playerColor as PlayerColor)) {
      return null;
    }

    return {
      kind: "ardature-sync-answer",
      version: 1,
      roomId,
      offerId,
      playerId,
      playerName,
      playerColor: playerColor as PlayerColor,
      sdp: { type: "answer", sdp },
    } satisfies SyncAnswerPayload;
  }

  if (isRecoveryOffer && fields.length === 7) {
    const [roomId, offerId, hostPlayerId, hostName, hostColor, disconnectedPlayers, sdp] = fields;
    const slots = parseRecoverySlots(disconnectedPlayers);

    if (!slots || !RECOVERY_PLAYER_COLORS.includes(hostColor as PlayerColor)) {
      return null;
    }

    return {
      kind: "ardature-sync-recovery-offer",
      version: 1,
      roomId,
      offerId,
      hostPlayerId,
      hostName,
      hostColor: hostColor as PlayerColor,
      disconnectedPlayers: slots,
      sdp: { type: "offer", sdp },
    } satisfies SyncRecoveryOfferPayload;
  }

  if (isRecoveryAnswer && fields.length === 6) {
    const [roomId, offerId, playerId, playerName, playerColor, sdp] = fields;

    if (!RECOVERY_PLAYER_COLORS.includes(playerColor as PlayerColor)) {
      return null;
    }

    return {
      kind: "ardature-sync-recovery-answer",
      version: 1,
      roomId,
      offerId,
      playerId,
      playerName,
      playerColor: playerColor as PlayerColor,
      sdp: { type: "answer", sdp },
    } satisfies SyncRecoveryAnswerPayload;
  }

  return null;
}

function parseQrPayload(value: string) {
  try {
    const compactPayload = parseCompactPayload(value);

    if (compactPayload) {
      return compactPayload;
    }

    if (value.startsWith("Ardature:")) {
      const decompressed = decompressFromEncodedURIComponent(value.slice(6));
      return decompressed ? (JSON.parse(decompressed) as unknown) : null;
    }

    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function parseWireMessage(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function encodePayload(value: SyncOfferPayload | SyncAnswerPayload | SyncRecoveryOfferPayload | SyncRecoveryAnswerPayload) {
  if (value.kind === "ardature-sync-offer") {
    return encodeCompactPayload(COMPACT_OFFER_PREFIX, [
      value.roomId,
      value.offerId,
      value.hostPlayerId,
      value.hostName,
      value.hostColor,
      typeof value.sdp.sdp === "string" ? value.sdp.sdp : "",
    ]);
  }

  if (value.kind === "ardature-sync-answer") {
    return encodeCompactPayload(COMPACT_ANSWER_PREFIX, [
      value.roomId,
      value.offerId,
      value.playerId,
      value.playerName,
      value.playerColor,
      typeof value.sdp.sdp === "string" ? value.sdp.sdp : "",
    ]);
  }

  if (value.kind === "ardature-sync-recovery-offer") {
    return encodeCompactPayload(COMPACT_RECOVERY_OFFER_PREFIX, [
      value.roomId,
      value.offerId,
      value.hostPlayerId,
      value.hostName,
      value.hostColor,
      JSON.stringify(value.disconnectedPlayers),
      typeof value.sdp.sdp === "string" ? value.sdp.sdp : "",
    ]);
  }

  return encodeCompactPayload(COMPACT_RECOVERY_ANSWER_PREFIX, [
    value.roomId,
    value.offerId,
    value.playerId,
    value.playerName,
    value.playerColor,
    typeof value.sdp.sdp === "string" ? value.sdp.sdp : "",
  ]);
}

function isOfferPayload(value: unknown): value is SyncOfferPayload {
  const payload = value as Partial<SyncOfferPayload>;
  return (
    Boolean(payload) &&
    payload.kind === "ardature-sync-offer" &&
    payload.version === 1 &&
    typeof payload.roomId === "string" &&
    typeof payload.offerId === "string" &&
    typeof payload.hostPlayerId === "string" &&
    typeof payload.hostName === "string" &&
    RECOVERY_PLAYER_COLORS.includes(payload.hostColor as PlayerColor) &&
    Boolean(payload.sdp)
  );
}

function isRecoveryOfferPayload(value: unknown): value is SyncRecoveryOfferPayload {
  const payload = value as Partial<SyncRecoveryOfferPayload>;
  return (
    Boolean(payload) &&
    payload.kind === "ardature-sync-recovery-offer" &&
    payload.version === 1 &&
    typeof payload.roomId === "string" &&
    typeof payload.offerId === "string" &&
    typeof payload.hostPlayerId === "string" &&
    typeof payload.hostName === "string" &&
    RECOVERY_PLAYER_COLORS.includes(payload.hostColor as PlayerColor) &&
    Array.isArray(payload.disconnectedPlayers) &&
    payload.disconnectedPlayers.every(isRecoverySlot) &&
    Boolean(payload.sdp)
  );
}

function isRecoveryAnswerPayload(value: unknown): value is SyncRecoveryAnswerPayload {
  const payload = value as Partial<SyncRecoveryAnswerPayload>;
  return (
    Boolean(payload) &&
    payload.kind === "ardature-sync-recovery-answer" &&
    payload.version === 1 &&
    typeof payload.roomId === "string" &&
    typeof payload.offerId === "string" &&
    typeof payload.playerId === "string" &&
    typeof payload.playerName === "string" &&
    RECOVERY_PLAYER_COLORS.includes(payload.playerColor as PlayerColor) &&
    Boolean(payload.sdp)
  );
}

function isRecoverySlot(value: unknown): value is SyncRecoveryPlayerSlot {
  const slot = value as Partial<SyncRecoveryPlayerSlot>;
  return Boolean(slot) &&
    typeof slot === "object" &&
    typeof slot.id === "string" &&
    typeof slot.name === "string" &&
    RECOVERY_PLAYER_COLORS.includes(slot.color as PlayerColor);
}

function parseRecoverySlots(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) && parsed.every(isRecoverySlot)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function isAnswerPayload(value: unknown): value is SyncAnswerPayload {
  const payload = value as Partial<SyncAnswerPayload>;
  return (
    Boolean(payload) &&
    payload.kind === "ardature-sync-answer" &&
    payload.version === 1 &&
    typeof payload.roomId === "string" &&
    typeof payload.offerId === "string" &&
    typeof payload.playerId === "string" &&
    typeof payload.playerName === "string" &&
    RECOVERY_PLAYER_COLORS.includes(payload.playerColor as PlayerColor) &&
    Boolean(payload.sdp)
  );
}

function attachMessageHandler(
  channel: RTCDataChannel,
  playerId: string,
  callbacks: SyncTransportCallbacks,
  onHeartbeat?: (message: SyncWireMessage) => void,
) {
  channel.addEventListener("message", (event) => {
    if (typeof event.data !== "string") {
      return;
    }

    const message = parseWireMessage(event.data);
    if (!message || typeof message !== "object" || typeof (message as SyncWireMessage).type !== "string") {
      return;
    }

    if (isHeartbeatMessage(message)) {
      onHeartbeat?.(message);
      return;
    }

    callbacks.onMessage?.(playerId, message as SyncWireMessage);
  });
}

function sendChannelMessage(channel: RTCDataChannel, message: SyncWireMessage) {
  if (channel.readyState !== "open") {
    return;
  }

  channel.send(JSON.stringify(message));
}

function isHeartbeatMessage(message: unknown): message is SyncWireMessage {
  const wireMessage = message as Partial<SyncWireMessage>;
  return wireMessage.type === HEARTBEAT_PING || wireMessage.type === HEARTBEAT_PONG;
}

export function parseSyncOffer(value: string) {
  const payload = parseQrPayload(value);
  return isOfferPayload(payload) ? payload : null;
}

export function parseSyncAnswer(value: string) {
  const payload = parseQrPayload(value);
  return isAnswerPayload(payload) ? payload : null;
}

export function parseSyncRecoveryOffer(value: string) {
  const payload = parseQrPayload(value);
  return isRecoveryOfferPayload(payload) ? payload : null;
}

export function parseSyncRecoveryAnswer(value: string) {
  const payload = parseQrPayload(value);
  return isRecoveryAnswerPayload(payload) ? payload : null;
}

export class SyncHostTransport {
  private callbacks: SyncTransportCallbacks;
  private pendingOffers = new Map<string, PendingOffer>();
  private peers = new Map<string, HostPeer>();
  private reconnectGraceMs: number;
  private roomId: string;
  private hostColor: PlayerColor;
  private hostPlayerId: string;
  private hostName: string;

  constructor({
    callbacks,
    hostColor,
    hostName,
    hostPlayerId,
    reconnectGraceMs = DEFAULT_RECONNECT_GRACE_MS,
    roomId,
  }: {
    callbacks: SyncTransportCallbacks;
    hostColor: PlayerColor;
    hostName: string;
    hostPlayerId: string;
    reconnectGraceMs?: number;
    roomId: string;
  }) {
    this.callbacks = callbacks;
    this.hostColor = hostColor;
    this.hostName = hostName;
    this.hostPlayerId = hostPlayerId;
    this.reconnectGraceMs = reconnectGraceMs;
    this.roomId = roomId;
  }

  async createOffer() {
    const offer = await this.createPendingOffer();

    const payload: SyncOfferPayload = {
      kind: "ardature-sync-offer",
      version: 1,
      roomId: this.roomId,
      offerId: offer.offerId,
      hostPlayerId: this.hostPlayerId,
      hostName: this.hostName,
      hostColor: this.hostColor,
      sdp: offer.sdp,
    };

    return encodePayload(payload);
  }

  async createRecoveryOffer(disconnectedPlayers: SyncRecoveryPlayerSlot[]) {
    const offer = await this.createPendingOffer();

    const payload: SyncRecoveryOfferPayload = {
      kind: "ardature-sync-recovery-offer",
      version: 1,
      roomId: this.roomId,
      offerId: offer.offerId,
      hostPlayerId: this.hostPlayerId,
      hostName: this.hostName,
      hostColor: this.hostColor,
      disconnectedPlayers,
      sdp: offer.sdp,
    };

    return encodePayload(payload);
  }

  private async createPendingOffer() {
    const offerId = crypto.randomUUID();
    const peerConnection = createPeerConnection();
    const channel = peerConnection.createDataChannel(CHANNEL_NAME);

    this.pendingOffers.set(offerId, { channel, peerConnection });
    peerConnection.addEventListener("connectionstatechange", () => {
      if (peerConnection.connectionState === "closed" || peerConnection.connectionState === "failed") {
        this.closePendingOffer(offerId);
      }
    });

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    await waitForIceGathering(peerConnection);

    return {
      offerId,
      sdp: peerConnection.localDescription?.toJSON() ?? offer,
    };
  }

  async acceptAnswer(value: string) {
    const answer = parseSyncAnswer(value);

    if (!answer || answer.roomId !== this.roomId) {
      throw new Error("this is not an answer QR for this room.");
    }

    return this.acceptParsedAnswer(answer);
  }

  async acceptRecoveryAnswer(value: string) {
    const answer = parseSyncRecoveryAnswer(value);

    if (!answer || answer.roomId !== this.roomId) {
      throw new Error("this is not a recovery answer QR for this room.");
    }

    return this.acceptParsedAnswer(answer);
  }

  broadcast(message: SyncWireMessage) {
    this.peers.forEach((peer) => {
      if (!peer.closedNotified && peer.status === "connected") {
        sendChannelMessage(peer.channel, message);
      }
    });
  }

  sendToPeer(playerId: string, message: SyncWireMessage) {
    const peer = this.peers.get(playerId);

    if (peer && !peer.closedNotified && peer.status === "connected") {
      sendChannelMessage(peer.channel, message);
    }
  }

  removePeer(playerId: string) {
    const peer = this.peers.get(playerId);

    if (!peer) {
      return;
    }

    this.peers.delete(playerId);
    this.closePeer(peer);
  }

  close() {
    this.pendingOffers.forEach((pending) => {
      pending.channel.close();
      pending.peerConnection.close();
    });
    this.pendingOffers.clear();

    this.peers.forEach((peer) => this.closePeer(peer));
    this.peers.clear();
  }

  private handlePeerConnectionState(playerId: string, state: RTCPeerConnectionState) {
    if (state === "connected") {
      return;
    }

    if (state === "disconnected") {
      this.markPeerReconnecting(playerId);
      return;
    }

    if (state === "failed" || state === "closed") {
      this.markPeerReconnecting(playerId);
    }
  }

  private async acceptParsedAnswer(answer: SyncAnswerPayload | SyncRecoveryAnswerPayload) {
    const pending = this.pendingOffers.get(answer.offerId);

    if (!pending) {
      throw new Error("this answer does not match the current host QR.");
    }

    attachMessageHandler(pending.channel, answer.playerId, {
      ...this.callbacks,
      onMessage: (playerId, message) => {
        this.notePeerHeartbeat(playerId);
        this.callbacks.onMessage?.(playerId, message);
      },
    }, (message) => {
      this.notePeerHeartbeat(answer.playerId);
      if (message.type === HEARTBEAT_PING) {
        sendChannelMessage(pending.channel, { type: HEARTBEAT_PONG, sentAt: Date.now() });
      }
    });

    try {
      await pending.peerConnection.setRemoteDescription(answer.sdp);
      await waitForChannelOpen(pending.channel);
    } catch (error) {
      this.closePendingOffer(answer.offerId);
      throw error;
    }

    this.pendingOffers.delete(answer.offerId);
    this.peers.set(answer.playerId, {
      channel: pending.channel,
      closedNotified: false,
      heartbeatInterval: 0,
      lastHeardAt: Date.now(),
      peerConnection: pending.peerConnection,
      playerName: answer.playerName,
      reconnectTimer: 0,
      status: "connected",
    });
    this.startPeerHeartbeat(answer.playerId);

    this.callbacks.onPeerOpen?.(answer.playerId);
    this.callbacks.onPeerStatus?.(answer.playerId, "connected");
    pending.channel.addEventListener("close", () => this.markPeerReconnecting(answer.playerId));
    pending.peerConnection.addEventListener("connectionstatechange", () => {
      this.handlePeerConnectionState(answer.playerId, pending.peerConnection.connectionState);
    });

    return {
      id: answer.playerId,
      name: answer.playerName,
      color: answer.playerColor,
    };
  }

  private markPeerConnected(playerId: string) {
    const peer = this.peers.get(playerId);

    if (!peer || peer.closedNotified) {
      return;
    }

    window.clearTimeout(peer.reconnectTimer);
    peer.reconnectTimer = 0;

    if (peer.status === "connected") {
      return;
    }

    peer.status = "connected";
    this.callbacks.onPeerStatus?.(playerId, "connected");
  }

  private notePeerHeartbeat(playerId: string) {
    const peer = this.peers.get(playerId);

    if (!peer || peer.closedNotified) {
      return;
    }

    peer.lastHeardAt = Date.now();
    this.markPeerConnected(playerId);
  }

  private startPeerHeartbeat(playerId: string) {
    const peer = this.peers.get(playerId);

    if (!peer || peer.closedNotified) {
      return;
    }

    window.clearInterval(peer.heartbeatInterval);
    peer.lastHeardAt = Date.now();
    peer.heartbeatInterval = window.setInterval(() => {
      if (peer.closedNotified || peer.status === "gone") {
        return;
      }

      if (Date.now() - peer.lastHeardAt > HEARTBEAT_TIMEOUT_MS) {
        this.markPeerReconnecting(playerId);
      }

      sendChannelMessage(peer.channel, { type: HEARTBEAT_PING, sentAt: Date.now() });
    }, HEARTBEAT_INTERVAL_MS);
  }

  private markPeerReconnecting(playerId: string) {
    const peer = this.peers.get(playerId);

    if (!peer || peer.closedNotified || peer.status === "reconnecting" || peer.status === "gone") {
      return;
    }

    peer.status = "reconnecting";
    this.callbacks.onPeerStatus?.(playerId, "reconnecting");
    window.clearTimeout(peer.reconnectTimer);
    peer.reconnectTimer = window.setTimeout(() => this.markPeerGone(playerId), this.reconnectGraceMs);
  }

  private markPeerGone(playerId: string) {
    const peer = this.peers.get(playerId);

    if (!peer || peer.closedNotified) {
      return;
    }

    peer.status = "gone";
    peer.closedNotified = true;
    window.clearInterval(peer.heartbeatInterval);
    window.clearTimeout(peer.reconnectTimer);
    peer.reconnectTimer = 0;
    peer.channel.close();
    peer.peerConnection.close();
    this.callbacks.onPeerStatus?.(playerId, "gone");
    this.callbacks.onPeerClosed?.(playerId);
  }

  private closePeer(peer: HostPeer) {
    peer.closedNotified = true;
    window.clearInterval(peer.heartbeatInterval);
    window.clearTimeout(peer.reconnectTimer);
    peer.channel.close();
    peer.peerConnection.close();
  }

  private closePendingOffer(offerId: string) {
    const pending = this.pendingOffers.get(offerId);

    if (!pending) {
      return;
    }

    pending.channel.close();
    pending.peerConnection.close();
    this.pendingOffers.delete(offerId);
  }
}

export class SyncJoinTransport {
  private callbacks: Omit<SyncTransportCallbacks, "onPeerClosed" | "onPeerOpen"> & {
    onClosed?: () => void;
    onOpen?: () => void;
    onStatus?: (status: SyncConnectionStatus) => void;
  };
  private channel: RTCDataChannel | null = null;
  private closedNotified = false;
  private heartbeatInterval = 0;
  private lastHeardAt = 0;
  private locallyClosed = false;
  private peerConnection: RTCPeerConnection | null = null;
  private reconnectGraceMs: number;
  private reconnectTimer = 0;
  private status: SyncConnectionStatus = "connected";

  constructor(callbacks: Omit<SyncTransportCallbacks, "onPeerClosed" | "onPeerOpen"> & {
    onClosed?: () => void;
    onOpen?: () => void;
    onStatus?: (status: SyncConnectionStatus) => void;
  }, reconnectGraceMs = DEFAULT_RECONNECT_GRACE_MS) {
    this.callbacks = callbacks;
    this.reconnectGraceMs = reconnectGraceMs;
  }

  async createAnswer(value: string, player: { color: PlayerColor; id: string; name: string }) {
    const offer = parseSyncOffer(value);

    if (!offer) {
      throw new Error("this is not an Ardatúrë host QR.");
    }

    const peerConnection = createPeerConnection();
    this.closedNotified = false;
    this.locallyClosed = false;
    this.peerConnection = peerConnection;

    peerConnection.addEventListener("datachannel", (event) => {
      this.channel = event.channel;
      attachMessageHandler(event.channel, offer.hostPlayerId, {
        ...this.callbacks,
        onMessage: (playerId, message) => {
          this.noteHeartbeat();
          this.callbacks.onMessage?.(playerId, message);
        },
      }, (message) => {
        this.noteHeartbeat();
        if (message.type === HEARTBEAT_PING) {
          sendChannelMessage(event.channel, { type: HEARTBEAT_PONG, sentAt: Date.now() });
        }
      });
      event.channel.addEventListener("open", () => {
        this.markConnected();
        this.startHeartbeat();
        this.callbacks.onOpen?.();
        this.send({ type: "join", playerId: player.id, playerName: player.name });
      });
      event.channel.addEventListener("close", () => this.markReconnecting());
    });
    peerConnection.addEventListener("connectionstatechange", () => {
      this.handleConnectionState(peerConnection.connectionState);
    });

    await peerConnection.setRemoteDescription(offer.sdp);
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    await waitForIceGathering(peerConnection);

    const payload: SyncAnswerPayload = {
      kind: "ardature-sync-answer",
      version: 1,
      roomId: offer.roomId,
      offerId: offer.offerId,
      playerId: player.id,
      playerName: player.name,
      playerColor: player.color,
      sdp: peerConnection.localDescription?.toJSON() ?? answer,
    };

    return {
      answerText: encodePayload(payload),
      hostColor: offer.hostColor,
      hostName: offer.hostName,
      hostPlayerId: offer.hostPlayerId,
      roomId: offer.roomId,
    };
  }

  async createRecoveryAnswer(value: string, player: { color: PlayerColor; id: string; name: string }) {
    const offer = parseSyncRecoveryOffer(value);

    if (!offer) {
      throw new Error("this is not an Ardatúrë recovery QR.");
    }

    return this.createAnswerForOffer(offer, player, "ardature-sync-recovery-answer");
  }

  private async createAnswerForOffer(
    offer: SyncOfferPayload | SyncRecoveryOfferPayload,
    player: { color: PlayerColor; id: string; name: string },
    kind: SyncAnswerPayload["kind"] | SyncRecoveryAnswerPayload["kind"],
  ) {
    const peerConnection = createPeerConnection();
    this.closedNotified = false;
    this.locallyClosed = false;
    this.peerConnection = peerConnection;

    peerConnection.addEventListener("datachannel", (event) => {
      this.channel = event.channel;
      attachMessageHandler(event.channel, offer.hostPlayerId, {
        ...this.callbacks,
        onMessage: (playerId, message) => {
          this.noteHeartbeat();
          this.callbacks.onMessage?.(playerId, message);
        },
      }, (message) => {
        this.noteHeartbeat();
        if (message.type === HEARTBEAT_PING) {
          sendChannelMessage(event.channel, { type: HEARTBEAT_PONG, sentAt: Date.now() });
        }
      });
      event.channel.addEventListener("open", () => {
        this.markConnected();
        this.startHeartbeat();
        this.callbacks.onOpen?.();
        if (kind === "ardature-sync-answer") {
          this.send({ type: "join", playerId: player.id, playerName: player.name });
        }
      });
      event.channel.addEventListener("close", () => this.markReconnecting());
    });
    peerConnection.addEventListener("connectionstatechange", () => {
      this.handleConnectionState(peerConnection.connectionState);
    });

    await peerConnection.setRemoteDescription(offer.sdp);
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    await waitForIceGathering(peerConnection);

    const payload = {
      kind,
      version: 1,
      roomId: offer.roomId,
      offerId: offer.offerId,
      playerId: player.id,
      playerName: player.name,
      playerColor: player.color,
      sdp: peerConnection.localDescription?.toJSON() ?? answer,
    } satisfies SyncAnswerPayload | SyncRecoveryAnswerPayload;

    return {
      answerText: encodePayload(payload),
      hostColor: offer.hostColor,
      hostName: offer.hostName,
      hostPlayerId: offer.hostPlayerId,
      roomId: offer.roomId,
    };
  }

  send(message: SyncWireMessage) {
    if (!this.channel) {
      return;
    }

    sendChannelMessage(this.channel, message);
  }

  close() {
    this.locallyClosed = true;
    this.closedNotified = true;
    window.clearInterval(this.heartbeatInterval);
    window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = 0;
    this.channel?.close();
    this.peerConnection?.close();
    this.channel = null;
    this.peerConnection = null;
  }

  private handleConnectionState(state: RTCPeerConnectionState) {
    if (state === "connected") {
      return;
    }

    if (state === "disconnected") {
      this.markReconnecting();
      return;
    }

    if (state === "failed" || state === "closed") {
      this.markReconnecting();
    }
  }

  private markConnected() {
    if (this.locallyClosed || this.closedNotified) {
      return;
    }

    window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = 0;

    if (this.status === "connected") {
      return;
    }

    this.status = "connected";
    this.callbacks.onStatus?.("connected");
  }

  private noteHeartbeat() {
    if (this.locallyClosed || this.closedNotified) {
      return;
    }

    this.lastHeardAt = Date.now();
    this.markConnected();
  }

  private startHeartbeat() {
    if (!this.channel || this.locallyClosed || this.closedNotified) {
      return;
    }

    window.clearInterval(this.heartbeatInterval);
    this.lastHeardAt = Date.now();
    this.heartbeatInterval = window.setInterval(() => {
      if (!this.channel || this.locallyClosed || this.closedNotified || this.status === "gone") {
        return;
      }

      if (Date.now() - this.lastHeardAt > HEARTBEAT_TIMEOUT_MS) {
        this.markReconnecting();
      }

      sendChannelMessage(this.channel, { type: HEARTBEAT_PING, sentAt: Date.now() });
    }, HEARTBEAT_INTERVAL_MS);
  }

  private markReconnecting() {
    if (this.locallyClosed || this.closedNotified || this.status === "reconnecting") {
      return;
    }

    this.status = "reconnecting";
    this.callbacks.onStatus?.("reconnecting");
    window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = window.setTimeout(() => this.markGone(), this.reconnectGraceMs);
  }

  private markGone() {
    if (this.locallyClosed || this.closedNotified) {
      return;
    }

    this.status = "gone";
    this.closedNotified = true;
    window.clearInterval(this.heartbeatInterval);
    window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = 0;
    this.callbacks.onStatus?.("gone");
    this.callbacks.onClosed?.();
  }
}
