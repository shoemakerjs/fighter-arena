# TODO

## Match stats for balancing (internal, not shown to players)

Record every finished match somewhere central so we can balance from real games instead of bot-vs-bot runs.

- **What to record per match:** both champions, winner, round score, duration, mode (online / vs bot + difficulty), game version.
- **Skillshot accuracy:** casts vs hits per ability (Chain, Spark, Longshot, Steel Tempest…) — the main thing bots get wrong.
- **Per-ability numbers:** damage dealt and times used.
- Online matches: only the host sends the result, so a match isn't counted twice.
- No personal data; at most an anonymous random player id kept in localStorage.

**Where it goes (pick one):**

1. **Google Sheet** (preferred for playtests): a small Apps Script web app appends one row per match; we read the sheet and build the "who beats whom" table and accuracy from it.
2. **Supabase**: real Postgres table with insert-only access; better if there are many players or we want full match logs.

The public write URL / key ends up in the page source, so fake rows are possible — fine for playtests with friends.

## Online 2v2

2v2 works offline (you + bot ally vs two bots). Next: a four-seat lobby where empty seats are bots.

- Rollback for four players: the host relays everyone's inputs (star), or a full PeerJS mesh.
- Lobby with four slots and teams; host fills empty seats with bots (the host runs them).
- Hash checks / resync already work per match; extend the input messages with a player id.
