import { CHAMPIONS } from '../sim/constants';
import { NetLink, type NetMsg } from './link';
import { RollbackSession } from './rollback';

export interface LobbyHooks {
  /** Both players are ready: start playing this session. */
  onStart(session: RollbackSession): void;
  /** The other player went back to the lobby after a match. */
  onBack(): void;
  /** The lobby is gone (left, or the connection dropped); `reason` is shown to the player. */
  onExit(reason?: string): void;
}

const $ = (id: string) => document.getElementById(id)!;

/**
 * Online 1v1: the host opens a lobby and shares a link, the guest opens it, both
 * pick a champion and press ready. The host is always player 0.
 */
export class Lobby {
  private link: NetLink | null = null;
  private isHost = false;
  private myChamp = 0;
  private myReady = false;
  private foeChamp = -1;
  private foeReady = false;
  session: RollbackSession | null = null;

  constructor(private hooks: LobbyHooks) {
    for (const btn of document.querySelectorAll<HTMLButtonElement>('#lobby-champ button')) {
      btn.addEventListener('click', () => {
        if (this.myReady) return;
        this.myChamp = Number(btn.dataset.value);
        this.sync();
      });
    }
    $('lobby-ready').addEventListener('click', () => {
      this.myReady = !this.myReady;
      this.sync();
      this.maybeStart();
    });
    $('lobby-copy').addEventListener('click', () => {
      const input = $('lobby-link') as HTMLInputElement;
      void navigator.clipboard?.writeText(input.value);
      $('lobby-copy').textContent = 'Skopiowano';
      setTimeout(() => ($('lobby-copy').textContent = 'Kopiuj'), 1500);
    });
    $('lobby-leave').addEventListener('click', () => this.leave());
  }

  get localId() {
    return this.isHost ? 0 : 1;
  }

  async host(champ: number) {
    this.reset(true, champ);
    this.status('Tworzę lobby…');
    try {
      const code = await this.link!.host();
      const url = `${location.origin}${location.pathname}?lobby=${code}`;
      ($('lobby-link') as HTMLInputElement).value = url;
      $('lobby-share').classList.remove('hidden');
      this.status('Wyślij link znajomemu i poczekaj, aż dołączy.');
    } catch (err) {
      this.fail((err as Error).message);
    }
  }

  async join(code: string, champ: number) {
    this.reset(false, champ);
    this.status('Łączę z lobby…');
    try {
      await this.link!.join(code);
    } catch (err) {
      this.fail((err as Error).message);
    }
  }

  /** After a match: both go back to picking champions. */
  backToLobby(notify = true) {
    this.session = null;
    this.myReady = false;
    this.foeReady = false;
    if (notify) this.link?.send({ t: 'back' });
    this.show();
    this.sync();
  }

  leave(reason?: string) {
    this.link?.close();
    this.link = null;
    this.session = null;
    $('lobby').classList.add('hidden');
    const url = new URL(location.href);
    url.searchParams.delete('lobby');
    history.replaceState(null, '', url);
    this.hooks.onExit(reason);
  }

  show() {
    $('lobby').classList.remove('hidden');
  }

  private reset(host: boolean, champ: number) {
    this.link?.close();
    this.isHost = host;
    this.myChamp = champ;
    this.myReady = false;
    this.foeChamp = -1;
    this.foeReady = false;
    this.session = null;
    $('lobby-share').classList.add('hidden');
    $('lobby-title').textContent = host ? 'Twoje lobby' : 'Dołączasz do lobby';

    const link = new NetLink();
    this.link = link;
    link.onConnect = () => {
      this.status('Połączono! Wybierzcie postacie i kliknijcie „Gotowy”.');
      $('lobby-share').classList.add('hidden');
      this.sync();
    };
    link.onMessage = (msg) => this.onMessage(msg);
    link.onClose = (reason) => {
      if (this.link === link) this.leave(reason);
    };
    this.show();
    this.sync();
  }

  private onMessage(msg: NetMsg) {
    switch (msg.t) {
      case 'lobby':
        this.foeChamp = msg.champ;
        this.foeReady = msg.ready;
        this.sync(false);
        this.maybeStart();
        break;
      case 'start':
        if (!this.isHost) this.begin(msg.champs);
        break;
      case 'input':
        this.session?.onRemoteInput(msg.frame, msg.input, msg.adv);
        break;
      case 'hash':
        this.session?.onRemoteHash(msg.frame, msg.hash);
        break;
      case 'back':
        if (this.session) {
          this.backToLobby(false);
          this.hooks.onBack();
        }
        break;
    }
  }

  /** Only the host starts the match, so both sides agree on the champions. */
  private maybeStart() {
    if (!this.isHost || !this.myReady || !this.foeReady || this.foeChamp < 0 || this.session) return;
    const champs = [this.myChamp, this.foeChamp];
    this.link!.send({ t: 'start', champs });
    this.begin(champs);
  }

  private begin(champs: number[]) {
    const link = this.link!;
    this.session = new RollbackSession(this.localId, champs, {
      sendInput: (frame, input, adv) => link.send({ t: 'input', frame, input, adv }),
      sendHash: (frame, hash) => link.send({ t: 'hash', frame, hash }),
      onDesync: (frame) => console.error(`Desync at frame ${frame}`),
    });
    $('lobby').classList.add('hidden');
    this.hooks.onStart(this.session);
  }

  /** Refresh the lobby UI and (optionally) tell the other player our pick. */
  private sync(send = true) {
    const connected = !!this.link?.connected;
    for (const btn of document.querySelectorAll<HTMLButtonElement>('#lobby-champ button')) {
      btn.classList.toggle('active', Number(btn.dataset.value) === this.myChamp);
      btn.disabled = this.myReady;
    }
    const me = CHAMPIONS[this.myChamp];
    $('lobby-me-role').textContent = `${me.role} · ${me.hp} HP`;
    $('lobby-me-state').textContent = this.myReady ? 'Gotowy' : 'Wybiera…';
    $('lobby-me-state').classList.toggle('ready', this.myReady);

    $('lobby-foe-champ').textContent = connected && this.foeChamp >= 0 ? CHAMPIONS[this.foeChamp].name : '—';
    $('lobby-foe-state').textContent = !connected ? 'Nie dołączył' : this.foeReady ? 'Gotowy' : 'Wybiera…';
    $('lobby-foe-state').classList.toggle('ready', connected && this.foeReady);

    const ready = $('lobby-ready') as HTMLButtonElement;
    ready.disabled = !connected;
    ready.textContent = this.myReady ? 'Anuluj gotowość' : 'Gotowy';
    if (send && connected) this.link!.send({ t: 'lobby', champ: this.myChamp, ready: this.myReady });
  }

  private status(text: string) {
    $('lobby-status').textContent = text;
  }

  private fail(reason: string) {
    this.status(reason);
    $('lobby-share').classList.add('hidden');
  }
}
