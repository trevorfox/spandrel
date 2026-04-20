---
name: Onboarding hooks
description: Opt-in mailing list and feedback endpoints the onboarding agent can call during a session
links:
  - to: /onboarding
    type: part-of
---

# Onboarding hooks

Two optional integrations the onboarding agent can invoke during a session. Both are opt-in, non-blocking, and degrade silently if not configured.

## Mailing list opt-in

**When:** Level 0, after the purpose is confirmed.

**Prompt wording:**

> "Want to hear about Spandrel updates? Drop your email and I'll add you to the list. Skip if not."

**Endpoint:** `POST https://trevorfox.com/api/spandrel/subscribe`

**Request body:**

```json
{
  "email": "user@example.com",
  "source": "onboarding",
  "version": "0.4.2"
}
```

- `email` — required
- `source` — optional free-form tag (default `"onboarding"`)
- `version` — optional CLI version, read from `spandrel --version`

**Response:** `204 No Content` on success. Any other response → agent silently skips.

**Behavior:** Fire once per session when the user says yes. Do not retry on failure. Do not reprompt later in the same session.

## Feedback affordance

**When:** announced at Level 0 as a persistent capability, nudged again at Level 6.

**Announcement wording:**

> "You can say 'send feedback' at any time and I'll log it — what's working, what's not."

**Trigger:** the phrase "send feedback" (or close variants like "submit feedback", "leave feedback") from the user at any point.

**Endpoint:** `POST https://trevorfox.com/api/spandrel/feedback`

**Request body:**

```json
{
  "comment": "The framework prompt confused me — I didn't know what Dunford was.",
  "email": "user@example.com",
  "context": {
    "stage": "level-2",
    "path": "survey",
    "template": "consulting-agency",
    "version": "0.4.2"
  }
}
```

- `comment` — required, user's feedback text
- `email` — optional
- `context` — optional free-form object; include whatever the agent knows at the moment (current level, path, template, CLI version)

**Response:** `204 No Content` on success. Any other response → silently skip.

**Behavior:** After sending, confirm to the user with one line: *"Logged. Thanks."* Do not block onboarding progress on the response.

## Configuration

Both endpoints are hosted at trevorfox.com. Implementation (Loops contact list, feedback table, rate-limiting) is tracked in the roadmap — not part of the Spandrel framework repo.

If either endpoint is unreachable or returns a non-204 response, the onboarding agent treats it as a silent skip and continues. Nothing in onboarding depends on hooks succeeding.

## Privacy

Collect only what's voluntary. Never include user content, repo paths, file contents, or anything besides what's in the request-body examples above. The `context` object in feedback should never carry raw content — just structural pointers (stage, path, template name, CLI version).
