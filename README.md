# Grid Line

Formula 1 fan website. Final project, SE-2513. Team: Asset and Ramazan.

## Pages

- index.html: video homepage, season overview, team and FAQ.
- Drivers.html: 14 featured drivers, search, filters and likes.
- Schedule.html: race calendar, API session times and countdown.
- Contacts.html: validated message drafts.
- FanGuide.html: practice, qualifying and race explanations.
- Signup.html and Login.html: local account registration and login.
- Profile.html: user details, favorite team and liked drivers.
- MediaQueries.html: redirect for the previous page address.

## Structure

- css/style.css: shared theme, components and responsive rules.
- css/layout.css: navigation, sun/moon control and carousel layout.
- css/account.css: account and profile layouts.
- css/race-data.css: race calendar components.
- js/theme.js: appearance persistence.
- js/script.js: search, forms, FAQ, preferences and copy feedback.
- js/account.js and likes.js: accounts, sessions, profiles and likes.
- js/drivers-data.js: shared driver metadata.
- js/race-data.js: API retrieval, cache, sessions and countdown.
- Images/ and Fonts/: local media and F1 font.
- vendor/: Bootstrap and its license.
- tests/: account, likes, API and source checks.

## Run and test

Run `python -m http.server 8000` in this folder; open http://localhost:8000.
Use HTTPS or localhost for password hashing. No npm dependencies are required.

Checks: `node --test` and `python tests/site-audit.py`.

## Data

Accounts, themes, likes, drafts and preferences use localStorage in the current
browser. Authentication is a frontend simulation; Contacts saves drafts.
Race data comes from the public Jolpica F1 API, with loading, errors and retry.
API documentation: https://github.com/jolpica/jolpica-f1/blob/main/docs/endpoints/races.md

## Hosting

Repository: https://github.com/DikiyAsset/Assignment2WEBAssetRoma
Website: https://dikiyasset.github.io/Assignment2WEBAssetRoma/
