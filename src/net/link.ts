import { Peer, type DataConnection } from 'peerjs';
import type { Input } from '../sim/types';

/** Everything the two players say to each other. */
export type NetMsg =
  | { t: 'lobby'; champ: number; ready: boolean }
  | { t: 'start'; champs: number[] }
  /** Input for `frame`; `adv` is the sender's frame advantage, used for time sync. */
  | { t: 'input'; frame: number; input: Input; adv: number }
  | { t: 'hash'; frame: number; hash: number }
  | { t: 'back' }
  | { t: 'ping' };

/** Silence longer than this means the other player is gone. */
const TIMEOUT_MS = 6000;

/** Prefix keeps our ids apart from other apps on the public PeerJS server. */
const PREFIX = 'fighter-arena-';

function randomCode(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

/**
 * Peer-to-peer link between the two players (WebRTC data channel). Signaling goes
 * through the free public PeerJS server, so it works from a static page.
 */
export class NetLink {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private lastHeard = 0;
  private heartbeat = 0;
  code = '';
  onMessage: (msg: NetMsg) => void = () => {};
  onConnect: () => void = () => {};
  onClose: (reason: string) => void = () => {};

  get connected() {
    return !!this.conn?.open;
  }

  /** Open a lobby and wait for someone to join. Resolves with the lobby code. */
  host(): Promise<string> {
    this.code = randomCode();
    const peer = new Peer(PREFIX + this.code);
    this.peer = peer;
    peer.on('connection', (conn) => {
      if (this.conn) {
        conn.on('open', () => conn.close());
        return;
      }
      this.attach(conn);
    });
    return this.whenOpen(peer).then(() => this.code);
  }

  /** Join the lobby with this code. */
  join(code: string): Promise<void> {
    this.code = code;
    const peer = new Peer();
    this.peer = peer;
    return this.whenOpen(peer).then(() => {
      this.attach(peer.connect(PREFIX + code, { reliable: true }));
    });
  }

  send(msg: NetMsg) {
    if (this.conn?.open) this.conn.send(msg);
  }

  close() {
    const peer = this.peer;
    this.peer = null;
    this.conn = null;
    clearInterval(this.heartbeat);
    window.removeEventListener('pagehide', this.onPageHide);
    peer?.destroy();
  }

  private onPageHide = () => this.close();

  private attach(conn: DataConnection) {
    this.conn = conn;
    conn.on('open', () => {
      this.lastHeard = performance.now();
      // Closing the tab should tell the other side right away, not after a timeout.
      window.addEventListener('pagehide', this.onPageHide);
      this.heartbeat = window.setInterval(() => {
        this.send({ t: 'ping' });
        if (performance.now() - this.lastHeard > TIMEOUT_MS && this.conn === conn) {
          this.conn = null;
          this.onClose('Your opponent stopped responding.');
        }
      }, 1000);
      this.onConnect();
    });
    conn.on('data', (data) => {
      this.lastHeard = performance.now();
      const msg = data as NetMsg;
      if (msg.t !== 'ping') this.onMessage(msg);
    });
    conn.on('close', () => {
      if (this.conn === conn) {
        this.conn = null;
        this.onClose('Your opponent disconnected.');
      }
    });
    conn.on('error', () => this.onClose('The connection dropped.'));
  }

  private whenOpen(peer: Peer): Promise<void> {
    return new Promise((resolve, reject) => {
      peer.on('open', () => resolve());
      peer.on('error', (err) => {
        const type = (err as { type?: string }).type;
        const reason =
          type === 'peer-unavailable'
            ? 'This lobby does not exist (or the host closed it).'
            : type === 'network' || type === 'server-error' || type === 'socket-error'
              ? 'Cannot reach the lobby server.'
              : `Connection error (${type ?? 'unknown'}).`;
        if (this.conn) this.onClose(reason);
        reject(new Error(reason));
      });
      peer.on('disconnected', () => {
        // Lost the signaling server; an established game keeps running peer-to-peer.
        if (!this.conn) this.onClose('Lost connection to the lobby server.');
      });
    });
  }
}
