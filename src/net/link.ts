import { Peer, type DataConnection } from 'peerjs';
import type { GameState, Input } from '../sim/types';

/** Everything the players say to each other. Guests talk only to the host; the host relays. */
export type NetMsg =
  /** First thing each side says: which build it runs (they must match). */
  | { t: 'hello'; build: string }
  /** Host → everyone: the room — format, who sits where (peer ids, null = empty/bot), names, who's locked in. */
  | { t: 'room'; format: '1v1' | '2v2'; seats: (string | null)[]; names: (string | null)[]; ready: boolean[] }
  /** Guest → host: move me to this empty seat. */
  | { t: 'sit'; seat: number }
  /** Our pick and ready flag (guest → host). */
  | { t: 'lobby'; champ: number; ready: boolean }
  /** Host → guests: leave the lobby for champion select. */
  | { t: 'go' }
  /** Host → guests: start match `m` with these champions per seat. */
  | { t: 'start'; m: number; champs: number[]; seats: (string | null)[] }
  /**
   * In-match messages carry `m`, the match number in this lobby, so late packets
   * from a previous match are ignored. `adv`: guest → host, the guest's frame
   * advantage over the host; host → guest, the host's over that guest (time sync).
   */
  | { t: 'input'; m: number; slot: number; frame: number; input: Input; adv: number }
  | { t: 'hash'; m: number; frame: number; hash: number }
  /** Host → one guest after a hash mismatch: the host's state before `frame`, to adopt. */
  | { t: 'sync'; m: number; frame: number; state: GameState }
  /** Back to the lobby after a match (guest → host asks, host → everyone does it). */
  | { t: 'back' }
  | { t: 'ping' };

/** Silence longer than this means the other side is gone. */
const TIMEOUT_MS = 6000;

/** Prefix keeps our ids apart from other apps on the public PeerJS server. */
const PREFIX = 'fighter-arena-';

/** What a guest calls its one connection. */
export const HOST = 'host';

function randomCode(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

/**
 * Peer-to-peer links between the players (WebRTC data channels), as a star: the host
 * accepts up to `maxGuests` connections, a guest has one, to the host. Signaling goes
 * through the free public PeerJS server, so it works from a static page.
 */
export class NetLink {
  private peer: Peer | null = null;
  private conns = new Map<string, DataConnection>();
  private lastHeard = new Map<string, number>();
  private heartbeat = 0;
  private isHost = false;
  code = '';
  /** Host: how many guests may be connected at once (others are turned away). */
  maxGuests = 1;
  onMessage: (msg: NetMsg, from: string) => void = () => {};
  /** A guest joined (host), or we reached the host (guest, `id` = HOST). */
  onConnect: (id: string) => void = () => {};
  /** That connection is gone. The host's lobby code stays valid while `listening`. */
  onClose: (id: string, reason: string) => void = () => {};

  /** Number of open connections (a guest: 1 when connected to the host). */
  get connections() {
    let n = 0;
    for (const c of this.conns.values()) if (c.open) n++;
    return n;
  }

  get connected() {
    return this.connections > 0;
  }

  /** How the room refers to us: HOST for the host, our peer id for a guest. */
  get myId(): string {
    return this.isHost ? HOST : (this.peer?.id ?? '');
  }

  /** Host only: the lobby is still registered, so someone new can join with the same link. */
  get listening() {
    return this.isHost && !!this.peer && !this.peer.destroyed && !this.peer.disconnected;
  }

  /** Open a lobby and wait for people to join. Resolves with the lobby code. */
  host(): Promise<string> {
    this.code = randomCode();
    this.isHost = true;
    const peer = new Peer(PREFIX + this.code);
    this.peer = peer;
    peer.on('connection', (conn) => {
      if (this.conns.size >= this.maxGuests) {
        conn.on('open', () => conn.close());
        return;
      }
      this.attach(conn.peer, conn);
    });
    return this.whenOpen(peer).then(() => this.code);
  }

  /** Join the lobby with this code. */
  join(code: string): Promise<void> {
    this.code = code;
    this.isHost = false;
    const peer = new Peer();
    this.peer = peer;
    return this.whenOpen(peer).then(() => {
      this.attach(HOST, peer.connect(PREFIX + code, { reliable: true }));
    });
  }

  /** To everyone we're connected to. */
  send(msg: NetMsg) {
    for (const c of this.conns.values()) if (c.open) c.send(msg);
  }

  sendTo(id: string, msg: NetMsg) {
    const c = this.conns.get(id);
    if (c?.open) c.send(msg);
  }

  /** Host: turn a guest away. */
  kick(id: string) {
    const c = this.conns.get(id);
    if (c) this.drop(id, c, 'Removed from the lobby.');
  }

  close() {
    const peer = this.peer;
    this.peer = null;
    this.conns.clear();
    clearInterval(this.heartbeat);
    this.heartbeat = 0;
    window.removeEventListener('pagehide', this.onPageHide);
    peer?.destroy();
  }

  private onPageHide = () => this.close();

  private attach(id: string, conn: DataConnection) {
    this.conns.set(id, conn);
    conn.on('open', () => {
      this.lastHeard.set(id, performance.now());
      // Closing the tab should tell the others right away, not after a timeout.
      window.addEventListener('pagehide', this.onPageHide);
      if (!this.heartbeat) {
        this.heartbeat = window.setInterval(() => {
          this.send({ t: 'ping' });
          const now = performance.now();
          for (const [cid, c] of this.conns) {
            if (c.open && now - (this.lastHeard.get(cid) ?? now) > TIMEOUT_MS) this.drop(cid, c, 'stopped responding.');
          }
        }, 1000);
      }
      this.onConnect(id);
    });
    conn.on('data', (data) => {
      this.lastHeard.set(id, performance.now());
      const msg = data as NetMsg;
      if (msg.t !== 'ping') this.onMessage(msg, id);
    });
    conn.on('close', () => this.drop(id, conn, 'disconnected.'));
    conn.on('error', () => this.drop(id, conn, 'lost the connection.'));
  }

  /** Forget `conn` (if it is still the current one for `id`) and report it once. */
  private drop(id: string, conn: DataConnection, reason: string) {
    if (this.conns.get(id) !== conn) return;
    this.conns.delete(id);
    this.lastHeard.delete(id);
    if (this.conns.size === 0) {
      clearInterval(this.heartbeat);
      this.heartbeat = 0;
    }
    conn.close();
    this.onClose(id, reason);
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
        if (!this.isHost && this.conns.size) this.onClose(HOST, reason);
        reject(new Error(reason));
      });
      peer.on('disconnected', () => {
        // Lost the signaling server; established games keep running peer-to-peer.
        if (!this.conns.size) this.onClose(HOST, 'Lost connection to the lobby server.');
      });
    });
  }
}
