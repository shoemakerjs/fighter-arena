# Arena

Prototyp zręcznościowej areny 1v1 w stylu Battlerite, w przeglądarce (TypeScript + Three.js).

**Zagraj:** https://shoemakerjs.github.io/fighter-arena/

## 1v1 online

W menu kliknij **Graj 1v1 online**, skopiuj link i wyślij znajomemu. Gdy dołączy, obaj wybieracie postać i klikacie **Gotowy**.

- Połączenie jest bezpośrednie (WebRTC). Do zestawienia go służy darmowy publiczny serwer PeerJS, więc gra działa jako zwykła statyczna strona.
- Netcode to rollback (`src/net/rollback.ts`): każdy gra bez czekania, przewidując input przeciwnika, a przy pomyłce gra cofa się i przelicza klatki. Co 2 s obie strony porównują hash stanu, żeby wykryć rozjazd.
- Bez serwera TURN część sieci (np. niektóre sieci firmowe lub komórkowe z symetrycznym NAT) może się nie połączyć.

```bash
npm install
npm run dev
```

Trzy postacie z osobnymi zestawami umiejętności: **Mag** (dystans i kontrola), **Wojownik** (walka wręcz i inicjacja) i **Cień** (zabójca: znaki, niewidzialność, egzekucja). Postać wybierasz w menu, tam też jest lista umiejętności. Definicje są w `CHAMPIONS` w `src/sim/constants.ts`.

Arena ma **fog of war**: widzisz w promieniu `VISION_R`, a kolumny zasłaniają widok. Reguły są w `src/sim/vision.ts` i używa ich też bot, więc nie widzi przez mgłę.

Sterowanie jest opisane w menu gry. `Esc`: pauza, `M`: dźwięk.

Domyślnie gra renderuje się w 3D. Pod adresem `http://localhost:5173/?2d` jest płaski widok 2D z dokładnymi hitboxami, przydatny do debugowania i balansu.

## Struktura

```
src/
  sim/       deterministyczna logika gry: step(stan, inputy) → nowy stan; vision.ts: fog of war
  net/       online 1v1: link.ts (PeerJS), rollback.ts (netcode), lobby.ts (UI lobby)
  input/     źródła inputu: klawiatura+mysz (local.ts) i bot (bot.ts)
  render/    world3d.ts (Three.js) albo world2d.ts (Canvas), wspólny HUD,
             models.ts (proceduralne modele low-poly), efekty, dźwięk
  main.ts    pętla 60 Hz ze stałym krokiem, menu, tryby
```

Najważniejsza zasada: **wszystko, co wpływa na wynik, dzieje się w `src/sim/`** i zależy tylko od poprzedniego stanu i inputów obu graczy. Bez `Math.random`, `Date` ani funkcji trygonometrycznych, które mogą minimalnie różnić się między przeglądarkami. Dzięki temu:

- rollback netcode (online 1v1) da się dołożyć bez przepisywania gry;
- serwer może odtworzyć mecz z samych inputów i zweryfikować wynik do rankingu;
- bot korzysta z tego samego interfejsu `Input` co człowiek.

Balans (obrażenia, cooldowny, zasięgi) jest w `src/sim/constants.ts`.

## Dalsze kroki

1. Własny serwer sygnalizacji i TURN, matchmaking zamiast linków.
2. Weryfikacja meczów na serwerze (replay z inputów) + ranking Glicko-2.
3. Więcej postaci i umiejętności, EX-y za energię, lepsza grafika.
