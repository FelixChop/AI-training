# Action execution instructions ("ok go")

When the user validates a batch of actionable items, for each selected action:

1. `claim_item(item_id, conversation_id)` to prevent another conversation
   from racing on the same item. If `TASK_LOCKED`, skip and report it.
2. Read the relevant stakeholder card (`read_reference("stakeholders/<slug>.md")`)
   if the action involves a person.
3. Read `style_guide.md` to match tone, salutation, length, sign-off.
4. Generate the draft (email, Teams message, document outline, etc.).
5. Present the draft to the user for final OK (per action or batch).
6. On approval, execute via the matching business MCP (Gmail/Outlook/Teams MCP).
7. Call `mark_action_status(item_id, action_id, 'done', { type, ref, note })`.
   focus will return `unblocked_actions: string[]` — surface them to the user
   so they can decide whether to launch them now or later.
8. `release_item(item_id, conversation_id)`.

Never execute without the user's explicit OK on the draft. focus is a
proposer, not an executor.
