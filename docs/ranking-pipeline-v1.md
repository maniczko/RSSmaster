# Ranking Pipeline V1

## Goal

Turn `rssmaster` from a reverse-chronological stream into a bounded, explainable reading queue.

## Pipeline

1. Candidate intake
   - default freshness window: last `72h`
   - if the active window cannot fill the queue, ranking expands into an older unread backlog instead of returning an empty surface
   - default per-source cap: `30`
   - priority-source cap: `45`
   - emergency noisy-source threshold: `100` items per 24 hours
2. Hard suppression
   - paused sources
   - snoozed sources
   - muted sources
   - sources over their active budget
3. Scoring
   - `final_score = relevance_score + user_preference_score + source_quality_score + freshness_score + originality_score + engagement_score - duplicate_penalty - noise_penalty - saturation_penalty`
   - already-read items are removed from the recommendation queue
   - repetitive low-signal headlines (for example template quote/FX updates) are demoted unless the user profile explicitly signals interest
4. Ordering
   - source budgets are spent on the best-scoring candidates from each source, not simply the newest ones
   - higher `final_score` first
   - tie-break by newest publish timestamp
   - final tie-break by stable item id
5. Output cap
   - after scoring and source budgeting, the queue is trimmed to the reader's `daily_reading_goal`
   - lower-ranked overflow items stay in the library but are no longer treated as active recommendations

## Score Components

- `relevance_score`: baseline reading worth plus content availability and digest signals
- `user_preference_score`: explicit boost/suppress interests matched against title, excerpt, cleaned text, source, and category
- `source_quality_score`: healthy feeds rise, failing feeds drop, priority feeds get a lift
- `freshness_score`: newer items score higher inside the active candidate window
- `originality_score`: smaller story clusters score better than rewrite floods
- `originality_score`: repeated same-source rewrites lose points, while cross-source coverage is allowed to stay competitive
- `engagement_score`: saved items get a positive bias
- `duplicate_penalty`: repeated same-source rewrites reduce score sharply
- `noise_penalty`: very noisy feeds lose rank when they cross the emergency threshold
- `saturation_penalty`: repeated entries from the same source are progressively de-emphasized

## Determinism

- the same database snapshot and profile settings must produce the same ranking output
- ranking state is persisted so the UI can inspect candidate status, reason, and score breakdown
- explainability is mandatory: every ranked item must expose matched interests and a human-readable reason

## User Controls

- interests can be `boost`, `prefer`, `neutral`, or `suppress`
- source tier can be `priority`, `default`, or `muted`
- sources can also be paused or snoozed without destructive unsubscribe flows

## UI Contract

- ranked queue is the default for `Inbox + newest + no explicit search`
- story grouping can hide repeated rewrites while keeping alternates accessible
- briefing surfaces should reuse the same ranking snapshot instead of inventing a second ordering model
