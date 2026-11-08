## What this changes

<!-- One or two sentences. -->

## Security checklist

- [ ] Every new API route checks the session and role itself (the Admin SDK skips Security Rules)
- [ ] Every new role page calls `requireRole()` inside its own component, not only in the layout
- [ ] Important actions are signed with the user's passkey (`signedPost` + `verifySignedAction`)
- [ ] Signed payloads are validated without trimming or changing them
- [ ] New Firestore collections have rules in `firestore.rules` and a test in `tests/rules/`
- [ ] Inputs are validated with zod (`.strict()` so extra fields are refused)
- [ ] Nothing secret is logged, committed or sent to the browser

## How I tested it

<!-- Steps, and the result of npm test / npm run test:rules -->
