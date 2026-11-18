# Grid Line - Formula 1 fan website

Final project, group **SE-2513**. Team: **Asset and Ramazan**.

- Repository: https://github.com/DikiyAsset/Assignment2WEBAssetRoma
- Website: https://dikiyasset.github.io/Assignment2WEBAssetRoma/

## Run locally

Run `python -m http.server 8000` here and open `http://localhost:8000`.
Use HTTPS or localhost for browser password hashing. Saved accounts belong to the
browser origin; changing address or port creates a separate account store.

## Pages

| Page | Purpose |
| --- | --- |
| index.html | Introduction, season features, creators and FAQ |
| Drivers.html | Featured drivers, instant search, liked-only filter and hearts |
| Schedule.html | Calendar, external race data and session times |
| Contacts.html | Validated, locally saved contact draft |
| FanGuide.html | Introduction to practice, qualifying and the race |
| Signup.html | Create a browser-local demonstration account |
| Login.html | Check credentials and open Profile |
| Profile.html | View/edit details, liked drivers and logout |

MediaQueries.html is a compatibility redirect, not a content page.

## Requirements

1. CSS Grid/Flexbox/Bootstrap, collapsible navigation, mobile calendar cards.
2. Existing GitHub Pages publication from `main`, root `/`; `.nojekyll` included.
3. Persisted sun/moon switch after Contacts, early application and cross-tab updates.
4. Shared F1 typography, red accents, photographs and accessible controls.
5. Custom validation; registration/login/profile; instant driver search, saved
   query, and account-specific liked drivers.
6. Hover feedback, FAQ transitions and reduced-motion support.
7. Public Jolpica API: async fetch, loading, timeout, error/retry, validated
   timestamped cache, local session times and a confirmed Grand Prix countdown.
8. Driver collections and race information fit the F1 fan theme.
9. Two-speaker presentation script and backup screenshots accompany submission.
10. Shared styles, separate scripts, local assets and focused checks.

## Code organization

`css/style.css` contains shared tokens/layouts. `css/account.css` and
`css/race-data.css` style account and race components. In `js/`, `theme.js`
initializes appearance; `script.js` handles search, FAQ, forms and existing UI;
`drivers-data.js` holds shared metadata; `account.js` manages account validation,
salted PBKDF2 hashes, session/profile/likes; `likes.js` controls hearts; and
`race-data.js` normalizes, caches and renders external data.

Storage keys: `gridline.theme`, `gridline.accounts`, `gridline.session`,
`gridline.driverSearch`, `gridline.contactDraft`, `gridline.preferences`,
`gridline.raceCalendar.2026.v1`.

This is the required frontend authentication simulation. Accounts are local to
one browser, not verified by a server. Use demo passwords. Likes belong to the
selected account. The contact form saves drafts without sending email. Race data
is a schedule, not live timing; refresh failures retain dated cache/reference data.

Forms use `novalidate` and custom inline errors. Name/email/phone are checked where
present. Account passwords need 8-128 characters, uppercase, lowercase, a number
and a symbol. Confirmation must match. Forms that do not collect passwords do not
add an unrelated password field.

## Verification

Run `node --test`, then `python tests/site-audit.py`. No npm dependencies needed.
Checks cover account/like persistence and isolation, validation, API schema and
UI loading/error/retry/cache states, and local links/assets/form dependencies.

Browser checks: 64 layouts across eight content pages, widths 1440/768/390/320, both themes, height 900px.
Signup, wrong-password feedback, login/profile/edit/logout, likes, search/no-results,
contact/preferences, FAQ and carousel were checked. The real Jolpica request
succeeded in browser. Physical devices were not tested.

## Sources

- API: https://github.com/jolpica/jolpica-f1/blob/main/docs/endpoints/races.md
- Grid: https://www.formula1.com/en/latest/article/2026-line-ups-confirmed-in-full-who-is-on-the-grid-for-next-season.3TyLfOUjOwpBKOp3KX1PiS.3TyLfOUjOwpBKOp3KX1PiS
- Original local images, font, video and Bootstrap retained.

## Submission

Submit the project ZIP, report PDF and links TXT together. Each member submits
their own copy in Moodle FINAL EXAM FOLDER. Rehearse for 4:30-5:00; both members
speak. Actual presentation and Moodle submission remain team activities.

This final version is based on the supplied Gridline (3).zip: its 27 original image/font/audio assets and video-homepage identity are retained. Authentication, profile/likes, custom validation and the API use the reviewed shared components.
