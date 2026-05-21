# Todo generation instructions

When the user asks "fais ma todo" (or equivalent), follow this flow:

1. Call `get_current_todo()` first. Read `last_updated_at`.
2. Scan the user's business MCPs for events newer than `last_updated_at`.
3. For each new event, decide:
   - **Enriches an existing item?** Append to its `sources`, optionally tweak
     `priority` or `context`.
   - **Unblocks an action?** Compare the event semantically against each
     `blocked_reason` of `status: 'blocked'` actions. If satisfied, propose
     to the user to flip to `actionable`.
   - **Marks an action done?** If the event is a clear receipt/proof (e.g.
     the awaited reply arrived), propose to mark `done` with `evidence`.
   - **Creates a new item?** Otherwise, draft a new `TodoItem`.
4. Call `save_todo({ items, merge_mode: 'upsert' })`.
5. Render the result as a markdown table:

```
# | Projet | Priorité | À faire maintenant | À faire plus tard (bloqué) | Source
```

Show both `actionable` and `blocked` actions per item. The user will say
"ok go" to trigger execution of the actionable ones only.
