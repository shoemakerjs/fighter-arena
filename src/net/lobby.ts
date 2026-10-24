import { Bot } from '../input/bot';
import { CHAMPIONS } from '../sim/constants';
import { roughen } from '../ui/rough';
import { setStatusChip, type ChampionSelect } from '../ui/select';
import { HOST, NetLink, type NetMsg } from './link';
import { RollbackSession, type InputSource } from './rollback';

export type Format = '1v1' | '2v2';

export interface LobbyHooks {
  /** Everyone locked in: start playing this session; `names` per slot for the HUD. */
  onStart(session: RollbackSession, names: string[]): void;
  /** The match is over for us (back to the lobby, or someone left): show the lobby. */
  onBack(): void;
  /** The lobby is gone (left, or the host is gone); `reason` is shown to the player. */
  onExit(reason?: string): void;
}

const $ = (id: string) => document.getElementById(id)!;

/** Bots the host runs for empty 2v2 seats. */
const BOT_LEVEL = 'normal';

/**
 * Online lobby, 1v1 or 2v2. The host opens it and shares a link; guests join and
 * take seats (team 1 = seats 0 and 2, team 2 = seats 1 and 3; in 2v2 empty seats
 * are bots run by the host). The host picks the format and presses Start, everyone
 * picks a champion, and the match starts once every person is locked in.
 *
 * It's a star: guests talk only to the host, which owns the room state, relays
 * everyone's inputs and is the authority on a desync.
 */
export class Lobby {
  private link: NetLink | null = null;
  private isHost = false;
  private format: Format = '1v1';
  /** Who sits where: HOST, a guest's peer id, or null (empty / bot). */
  private seats: (string | null)[] = [HOST, null];
  /** Name per seat ("Host", "Player 2"…), null where empty. */
  private names: (string | null)[] = ['Host', null];
  /** Locked in on champion select, per seat. */
  private ready: boolean[] = [false, false];
  /** Host: each person's pick. */
  private picks = new Map<string, number>();
  /** Builds heard: the host's (guest side) or each guest's (host side). */
  private builds = new Map<string, string>();
  /** Host: names handed out so far. */
  private joined = 1;
  private myChamp = 0;
  /** Matches started in this lobby; in-match messages from an older one are ignored. */
  private match = 0;
  session: RollbackSession | null = null;

  constructor(
    private select: ChampionSelect,
    private hooks: LobbyHooks,
  ) {
    $('invite-copy').addEventListener('click', () => {
      const input = $('invite-link') as HTMLInputElement;
      void navigator.clipboard?.writeText(input.value);
      input.select();
      $('invite-copy').textContent = 'Copied';
      setTimeout(() => ($('invite-copy').textContent = 'Copy'), 1500);
    });
    $('invite-leave').addEventListener('click', () => this.leave());
    $('lobby-start').addEventListener('click', () => {
      if (!this.isHost || !this.canStart) return;
      this.link!.send({ t: 'go' });
      this.openSelect();
    });
    for (const btn of $('lobby-format').querySelectorAll<HTMLButtonElement>('button')) {
      btn.addEventListener('click', () => {
        (document.activeElement as HTMLElement | null)?.blur();
        if (this.isHost) this.setFormat(btn.dataset.format as Format);
      });
    }
  }

  get localId() {
    return this.mySeat;
  }

  get active() {
    return this.link !== null;
  }

  private get myId() {
    return this.link?.myId ?? HOST;
  }

  private get mySeat() {
    return this.seats.indexOf(this.myId);
  }

  private get guests(): string[] {
    return this.seats.filter((id): id is string => id !== null && id !== HOST);
  }

  /** Every build we've heard matches ours (different builds drift apart mid-match). */
  private get sameBuild() {
    const ids = this.isHost ? this.guests : [HOST];
    return ids.every((id) => this.builds.get(id) === __BUILD__);
  }

  private get canStart() {
    return !!this.link?.connected && this.guests.length > 0 && this.sameBuild && this.guests.every((id) => this.builds.has(id));
  }

  async host(champ: number) {
    this.reset(true, champ);
    this.status('Creating a lobby…');
    try {
      const code = await this.link!.host();
      const url = `${location.origin}${location.pathname}?lobby=${code}`;
      ($('invite-link') as HTMLInputElement).value = url;
      $('invite-share').classList.remove('hidden');
      this.showLobby();
    } catch (err) {
      this.status((err as Error).message);
    }
  }

  async join(code: string, champ: number) {
    this.reset(false, champ);
    this.status('Connecting to the lobby…');
    try {
      await this.link!.join(code);
    } catch (err) {
      this.status((err as Error).message);
    }
  }

  /** Called when the local player locks in on the champion select screen. */
  lockIn(champ: number) {
    this.myChamp = champ;
    if (this.isHost) {
      this.picks.set(HOST, champ);
      this.ready[this.mySeat] = true;
      this.broadcastRoom();
      this.maybeStart();
    } else {
      this.link?.send({ t: 'lobby', champ, ready: true });
    }
  }

  /** After a match: everyone goes back to the lobby screen; the host starts the next pick. */
  backToLobby(notify = true) {
    this.session = null;
    this.ready = this.seats.map(() => false);
    this.picks.clear();
    if (notify) this.link?.send({ t: 'back' });
    this.showLobby();
  }

  leave(reason?: string) {
    this.link?.close();
    this.link = null;
    this.session = null;
    $('invite').classList.add('hidden');
    this.select.close();
    const url = new URL(location.href);
    url.searchParams.delete('lobby');
    history.replaceState(null, '', url);
    this.hooks.onExit(reason);
  }

  private reset(host: boolean, champ: number) {
    this.link?.close();
    this.isHost = host;
    this.format = '1v1';
    this.seats = host ? [HOST, null] : [null, null];
    this.names = host ? ['Host', null] : [null, null];
    this.ready = [false, false];
    this.picks.clear();
    this.builds.clear();
    this.joined = 1;
    this.myChamp = champ;
    this.session = null;
    $('invite-share').classList.add('hidden');

    const link = new NetLink();
    link.maxGuests = 1;
    this.link = link;
    link.onConnect = (id) => {
      link.sendTo(id, { t: 'hello', build: __BUILD__ });
      if (this.isHost) this.seatGuest(id);
      else this.showLobby();
    };
    link.onMessage = (msg, from) => this.onMessage(msg, from);
    link.onClose = (id, reason) => {
      if (this.link !== link) return;
      if (this.isHost && link.listening) this.guestLeft(id, reason);
      else this.leave(id === HOST ? `The host ${reason}` : reason);
    };
    this.showLobby();
  }

  // ---------------------------------------------------------------- host: the room

  /** Host: a guest connected; give it the first free seat (or turn it away). */
  private seatGuest(id: string) {
    const seat = this.seats.indexOf(null);
    if (seat < 0) {
      this.link?.kick(id);
      return;
    }
    this.seats[seat] = id;
    this.names[seat] = `Player ${++this.joined}`;
    this.ready[seat] = false;
    this.broadcastRoom();
  }

  /** Host: a guest is gone. Mid-match everyone goes back to the lobby. */
  private guestLeft(id: string, reason: string) {
    const seat = this.seats.indexOf(id);
    const who = seat >= 0 ? (this.names[seat] ?? 'A player') : 'A player';
    if (seat >= 0) {
      this.seats[seat] = null;
      this.names[seat] = null;
      this.ready[seat] = false;
    }
    this.builds.delete(id);
    this.picks.delete(id);
    const inMatch = !!this.session || this.select.isOpen;
    if (inMatch) {
      this.backToLobby(true);
      this.hooks.onBack();
    }
    this.broadcastRoom();
    this.status(`${who} ${reason} The link still works for someone new.`);
  }

  private setFormat(format: Format) {
    if (format === this.format || this.session) return;
    const people = this.seats.filter((id) => id !== null) as string[];
    if (format === '1v1' && people.length > 2) return;
    this.format = format;
    const size = format === '2v2' ? 4 : 2;
    // Keep everyone in order, filling seats from the front.
    const oldNames = new Map(this.seats.map((id, i) => [id, this.names[i]]));
    this.seats = Array.from({ length: size }, (_, i) => people[i] ?? null);
    this.names = this.seats.map((id) => (id ? (oldNames.get(id) ?? null) : null));
    this.ready = this.seats.map(() => false);
    this.link!.maxGuests = size - 1;
    this.broadcastRoom();
  }

  /** Host: the room to every guest, then our own screen. */
  private broadcastRoom() {
    this.link?.send({ t: 'room', format: this.format, seats: this.seats, names: this.names, ready: this.ready });
    this.refresh();
  }

  private maybeStart() {
    if (!this.isHost || this.session) return;
    const people = this.seats.map((id, i) => (id ? i : -1)).filter((i) => i >= 0);
    if (!people.every((i) => this.ready[i])) return;
    // People play their picks; the bots of empty seats get a random champion.
    const champs = this.seats.map((id) => (id ? (this.picks.get(id) ?? 0) : Math.floor(Math.random() * CHAMPIONS.length)));
    const m = this.match + 1;
    this.link!.send({ t: 'start', m, champs, seats: this.seats });
    this.begin(m, champs, this.seats);
  }

  // ---------------------------------------------------------------- messages

  private onMessage(msg: NetMsg, from: string) {
    const s = this.session;
    switch (msg.t) {
      case 'hello':
        this.builds.set(from, msg.build);
        this.refresh();
        break;
      case 'room':
        if (this.isHost) break;
        this.format = msg.format;
        this.seats = msg.seats;
        this.names = msg.names;
        this.ready = msg.ready;
        this.refresh();
        break;
      case 'sit': {
        const seat = this.seats.indexOf(from);
        if (!this.isHost || seat < 0 || this.seats[msg.seat] !== null || this.session || this.select.isOpen) break;
        this.seats[msg.seat] = from;
        this.names[msg.seat] = this.names[seat];
        this.seats[seat] = null;
        this.names[seat] = null;
        this.broadcastRoom();
        break;
      }
      case 'lobby': {
        const seat = this.seats.indexOf(from);
        if (!this.isHost || seat < 0) break;
        this.picks.set(from, msg.champ);
        this.ready[seat] = msg.ready;
        this.broadcastRoom();
        this.maybeStart();
        break;
      }
      case 'go':
        if (!this.isHost) this.openSelect();
        break;
      case 'start':
        if (!this.isHost) this.begin(msg.m, msg.champs, msg.seats);
        break;
      case 'input':
        if (!s || msg.m !== this.match) break;
        s.onRemoteInput(msg.slot, msg.frame, msg.input);
        if (this.isHost) {
          // The guest's advantage over us, then pass its input on to the others.
          s.onRemoteAdvantage(msg.slot, msg.adv);
          for (const g of this.guests) if (g !== from) this.link!.sendTo(g, { ...msg, adv: s.advantageVs(this.seats.indexOf(g)) });
        } else {
          s.onRemoteAdvantage(this.seats.indexOf(HOST), msg.adv);
        }
        break;
      case 'hash':
        if (s && this.isHost && msg.m === this.match) s.onRemoteHash(this.seats.indexOf(from), msg.frame, msg.hash);
        break;
      case 'sync':
        if (s && msg.m === this.match) s.onRemoteSync(msg.frame, msg.state);
        break;
      case 'back':
        if (this.isHost) {
          if (this.session) {
            this.backToLobby(true);
            this.hooks.onBack();
          }
        } else if (this.session) {
          this.backToLobby(false);
          this.hooks.onBack();
        }
        break;
    }
  }

  private begin(m: number, champs: number[], seats: (string | null)[]) {
    const link = this.link!;
    this.match = m;
    this.seats = seats;
    const hostSlot = seats.indexOf(HOST);
    const humans = seats.map((id, i) => (id ? i : -1)).filter((i) => i >= 0);
    const bots = new Map<number, InputSource>();
    if (this.isHost) seats.forEach((id, i) => !id && bots.set(i, new Bot(i, BOT_LEVEL, Math.floor(Math.random() * 1e6))));
    const session = new RollbackSession(
      { localId: this.mySeat, champs, hostSlot, humans, bots },
      {
        sendInput: (slot, frame, input) => {
          if (this.isHost) {
            for (const g of this.guests) link.sendTo(g, { t: 'input', m, slot, frame, input, adv: session.advantageVs(seats.indexOf(g)) });
          } else {
            link.send({ t: 'input', m, slot, frame, input, adv: session.advantageVs(hostSlot) });
          }
        },
        sendHash: (frame, hash) => link.send({ t: 'hash', m, frame, hash }),
        sendSync: (slot, frame, state) => {
          const id = seats[slot];
          if (id) link.sendTo(id, { t: 'sync', m, frame, state });
        },
        onDesync: (frame) => console.warn(`Desync at frame ${frame}, sending our state`),
      },
    );
    this.session = session;
    this.select.close();
    const names = seats.map((id, i) => (i === this.mySeat ? 'YOU' : id ? (this.names[i] ?? 'PLAYER').toUpperCase() : 'BOT'));
    this.hooks.onStart(session, names);
  }

  // ---------------------------------------------------------------- screens

  /** Lobby screen: format, seats, the invite link (host) and Start (host). */
  private showLobby() {
    this.select.close();
    $('invite').classList.remove('hidden');
    this.refresh();
  }

  /** Redraw whatever is showing: the lobby, or the ready chip on champion select. */
  private refresh() {
    if (this.select.isOpen) {
      const others = this.seats.map((id, i) => (id && i !== this.mySeat ? i : -1)).filter((i) => i >= 0);
      this.select.setEnemy(others.every((i) => this.ready[i]) ? 'locked' : 'waiting');
      return;
    }
    if ($('invite').classList.contains('hidden')) return;

    for (const b of $('lobby-format').querySelectorAll<HTMLButtonElement>('button')) {
      b.classList.toggle('active', b.dataset.format === this.format);
      const people = this.seats.filter((id) => id !== null).length;
      b.disabled = !this.isHost || (b.dataset.format === '1v1' && people > 2);
    }
    this.renderSeats();

    const start = $('lobby-start') as HTMLButtonElement;
    start.classList.toggle('hidden', !this.isHost);
    start.disabled = !this.canStart;
    const connected = !!this.link?.connected;
    const waitingForHost = !this.isHost && connected && this.sameBuild;
    $('lobby-wait').classList.toggle('hidden', !waitingForHost);

    const heard = this.isHost ? this.guests.every((id) => this.builds.has(id)) : this.builds.has(HOST);
    if (connected && heard && !this.sameBuild) {
      this.status('Someone is on a different version of the game. Everyone refresh the page (Ctrl/Cmd + Shift + R) and join again.');
    } else if (connected && !heard) {
      this.status('Checking game versions… If this stays, someone has an older version: everyone refresh the page (Ctrl/Cmd + Shift + R).');
    } else if (this.isHost) {
      const bots = this.format === '2v2' ? ' Empty seats are played by bots.' : '';
      this.status(this.guests.length ? `Press Start to pick champions.${bots}` : `Send this link to your friends. Start unlocks when someone joins.${bots}`);
    } else if (connected) {
      this.status(this.format === '2v2' ? 'You are in. Click an empty seat to switch teams; the host starts the pick.' : 'You are in. The host starts the champion pick.');
    }
  }

  /** The seat cards: two side by side in 1v1, two teams of two in 2v2. */
  private renderSeats() {
    const box = $('lobby-seats');
    box.classList.toggle('duo', this.format === '2v2');
    const card = (seat: number) => {
      const id = this.seats[seat];
      const me = id !== null && id === this.myId;
      const el = document.createElement(id || this.format === '1v1' ? 'div' : 'button');
      el.className = `lobby-slot rough${this.format === '2v2' ? ' compact' : ''}${!id && this.format === '2v2' ? ' free' : ''}`;
      const chip = document.createElement('span');
      chip.className = 'status-chip';
      setStatusChip(chip, id !== null || this.format === '2v2');
      const name = document.createElement('span');
      name.className = 'slot-name display';
      name.textContent = me ? 'You' : id ? (this.names[seat] ?? 'Player') : this.format === '2v2' ? 'Bot' : 'Opponent';
      const sub = document.createElement('span');
      sub.className = 'slot-sub';
      sub.textContent = id
        ? id === HOST
          ? 'Host'
          : 'Joined'
        : this.format === '2v2'
          ? 'Click to sit here'
          : this.isHost
            ? 'Waiting for a player…'
            : 'Connecting…';
      el.append(chip, name, sub);
      if (!id && this.format === '2v2') el.addEventListener('click', () => this.sitAt(seat));
      roughen(el);
      return el;
    };
    box.replaceChildren();
    if (this.format === '1v1') {
      // Our own seat first.
      const order = this.mySeat === 1 ? [1, 0] : [0, 1];
      box.append(...order.map(card));
      return;
    }
    for (const team of [0, 1]) {
      const col = document.createElement('div');
      col.className = 'lobby-team';
      const title = document.createElement('p');
      title.className = 'kicker';
      title.textContent = `Team ${team + 1}`;
      col.append(title, card(team), card(team + 2));
      box.append(col);
    }
  }

  private sitAt(seat: number) {
    (document.activeElement as HTMLElement | null)?.blur();
    if (this.seats[seat] !== null || this.session) return;
    if (this.isHost) {
      const from = this.mySeat;
      this.seats[seat] = HOST;
      this.names[seat] = this.names[from];
      this.seats[from] = null;
      this.names[from] = null;
      this.broadcastRoom();
    } else {
      this.link?.send({ t: 'sit', seat });
    }
  }

  private openSelect() {
    $('invite').classList.add('hidden');
    this.select.open('online', this.myChamp);
    if (!this.isHost) this.link?.send({ t: 'lobby', champ: this.myChamp, ready: false });
    this.refresh();
  }

  private status(text: string) {
    $('invite-status').textContent = text;
  }
}
