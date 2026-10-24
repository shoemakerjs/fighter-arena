import { setStatusChip, type ChampionSelect } from '../ui/select';
import { NetLink, type NetMsg } from './link';
import { RollbackSession } from './rollback';

export interface LobbyHooks {
  /** Both players locked in: start playing this session. */
  onStart(session: RollbackSession): void;
  /** The match is over for us (the other player went back to the lobby, or left): show the lobby. */
  onBack(): void;
  /** The lobby is gone (left, or the connection dropped); `reason` is shown to the player. */
  onExit(reason?: string): void;
}

const $ = (id: string) => document.getElementById(id)!;

/**
 * Online 1v1: the host opens a lobby and shares a link, the guest opens it and
 * shows up on the lobby screen, the host presses Start and both pick on the
 * champion select screen. The host is always player 0 and decides when the match
 * starts, so both sides agree on the champions.
 */
export class Lobby {
  private link: NetLink | null = null;
  private isHost = false;
  private myChamp = 0;
  private myReady = false;
  private foeChamp = -1;
  private foeReady = false;
  /** The opponent's build, once it said hello. */
  private foeBuild: string | null = null;
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
      if (!this.isHost || !this.link?.connected || !this.sameBuild) return;
      this.link.send({ t: 'go' });
      this.openSelect();
    });
  }

  get localId() {
    return this.isHost ? 0 : 1;
  }

  get active() {
    return this.link !== null;
  }

  /** Both sides run the same build (different ones would drift apart mid-match). */
  private get sameBuild() {
    return this.foeBuild === __BUILD__;
  }

  async host(champ: number) {
    this.reset(true, champ);
    this.status('Creating a lobby…');
    try {
      const code = await this.link!.host();
      const url = `${location.origin}${location.pathname}?lobby=${code}`;
      ($('invite-link') as HTMLInputElement).value = url;
      $('invite-share').classList.remove('hidden');
      this.status('Send this link to a friend. Start unlocks when they join.');
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
    this.myReady = true;
    this.sendState();
    this.maybeStart();
  }

  /** After a match: both go back to the lobby screen; the host starts the next pick. */
  backToLobby(notify = true) {
    this.session = null;
    this.myReady = false;
    this.foeReady = false;
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
    this.myChamp = champ;
    this.myReady = false;
    this.foeChamp = -1;
    this.foeReady = false;
    this.foeBuild = null;
    this.session = null;
    $('invite-share').classList.add('hidden');

    const link = new NetLink();
    this.link = link;
    link.onConnect = () => {
      this.foeBuild = null;
      link.send({ t: 'hello', build: __BUILD__ });
      this.showLobby();
    };
    this.showLobby();
    link.onMessage = (msg) => this.onMessage(msg);
    link.onClose = (reason) => {
      if (this.link !== link) return;
      if (link.listening) this.guestLeft();
      else this.leave(reason);
    };
  }

  private onMessage(msg: NetMsg) {
    switch (msg.t) {
      case 'hello':
        this.foeBuild = msg.build;
        if (!this.session) this.showLobby();
        break;
      case 'lobby':
        this.foeChamp = msg.champ;
        this.foeReady = msg.ready;
        this.select.setEnemy(msg.ready ? 'locked' : 'waiting');
        this.maybeStart();
        break;
      case 'go':
        if (!this.isHost) this.openSelect();
        break;
      case 'start':
        if (!this.isHost) this.begin(msg.champs);
        break;
      case 'input':
        if (msg.m === this.match) this.session?.onRemoteInput(msg.frame, msg.input, msg.adv);
        break;
      case 'hash':
        if (msg.m === this.match) this.session?.onRemoteHash(msg.frame, msg.hash);
        break;
      case 'sync':
        if (msg.m === this.match) this.session?.onRemoteSync(msg.frame, msg.state);
        break;
      case 'back':
        if (this.session) {
          this.backToLobby(false);
          this.hooks.onBack();
        }
        break;
    }
  }

  /** Host: the guest is gone but the link still works, so wait for someone new. */
  private guestLeft() {
    const inMatch = !!this.session;
    this.foeChamp = -1;
    this.foeBuild = null;
    this.backToLobby(false);
    if (inMatch) this.hooks.onBack();
    this.status('Your opponent left. The link still works for someone new.');
  }

  private maybeStart() {
    if (!this.isHost || !this.myReady || !this.foeReady || this.foeChamp < 0 || this.session) return;
    const champs = [this.myChamp, this.foeChamp];
    this.link!.send({ t: 'start', champs });
    this.begin(champs);
  }

  private begin(champs: number[]) {
    const link = this.link!;
    const m = ++this.match;
    this.session = new RollbackSession(this.localId, champs, {
      sendInput: (frame, input, adv) => link.send({ t: 'input', m, frame, input, adv }),
      sendHash: (frame, hash) => link.send({ t: 'hash', m, frame, hash }),
      sendSync: (frame, state) => link.send({ t: 'sync', m, frame, state }),
      onDesync: (frame) => console.warn(`Desync at frame ${frame}${this.isHost ? ', sending our state' : ', waiting for the host'}`),
    });
    this.select.close();
    this.hooks.onStart(this.session);
  }

  /** Lobby screen: both player cards, the invite link (host) and Start (host, once someone joined). */
  private showLobby() {
    const joined = !!this.link?.connected;
    this.select.close();
    $('invite').classList.remove('hidden');
    setStatusChip($('slot-me-status'), true);
    $('slot-me-sub').textContent = this.isHost ? 'Host' : 'Joined';
    setStatusChip($('slot-foe-status'), joined);
    $('slot-foe-sub').textContent = joined ? (this.isHost ? 'Joined' : 'Host') : this.isHost ? 'Waiting for a player…' : 'Connecting…';
    const start = $('lobby-start') as HTMLButtonElement;
    start.classList.toggle('hidden', !this.isHost);
    start.disabled = !joined || !this.sameBuild;
    $('lobby-wait').classList.toggle('hidden', this.isHost || !joined || !this.sameBuild);
    if (joined && this.foeBuild !== null && !this.sameBuild) {
      this.status('You are on different versions of the game. Both refresh the page (Ctrl/Cmd + Shift + R) and join again.');
    } else if (joined && this.foeBuild !== null) {
      this.status(this.isHost ? 'Your friend is here. Press Start to pick champions.' : 'You are in. The host starts the champion pick.');
    } else if (joined) {
      this.status('Checking game versions… If this stays, your friend has an older version: both refresh the page (Ctrl/Cmd + Shift + R).');
    }
  }

  private openSelect() {
    this.myReady = false;
    this.foeReady = false;
    $('invite').classList.add('hidden');
    this.select.open('online', this.myChamp);
    this.sendState();
  }

  /** Our pick and ready flag; the opponent's screen shows only the ready status (blind pick). */
  private sendState() {
    this.link?.send({ t: 'lobby', champ: this.myChamp, ready: this.myReady });
  }

  private status(text: string) {
    $('invite-status').textContent = text;
  }
}
