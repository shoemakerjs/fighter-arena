# Arena

Prototyp zręcznościowej areny 1v1 w stylu Battlerite, w przeglądarce (TypeScript + Three.js).

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
  sim/       deterministyczna logika gry: step(stan, inputy) → nowy stan
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

1. Online 1v1: WebRTC DataChannel (tryb unreliable) + rollback, mały serwer Node do matchmakingu i sygnalizacji.
2. Weryfikacja meczów na serwerze (replay z inputów) + ranking Glicko-2.
3. Więcej postaci i umiejętności, EX-y za energię, lepsza grafika.
