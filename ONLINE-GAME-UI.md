# Online game UI standard

All new online games use `window.TooWeeOnlineLobby.render(target, options)` from `online-lobby.js` and `online-lobby.css` for host and student waiting rooms. Do not duplicate a game-specific lobby.

Use the original `assets/toowee-logo.webp`, a 150px header and its divider, game artwork, host invite card on the left, participants on the right, and mode information in the footer. Palette: cream, lavender and plum; no green UI backgrounds. Approved watercolor details are in `assets/online-lobby-art.webp`.

Options: kind (game-icons filename, special `sophie` header artwork), title, host, code, link, players (name, id, me), me, mode, disabled, start, startLabel, close, help, instructions, active. Callbacks must invoke the existing game's authorized server operations. Student views have no invitation or host controls. Only show ready status in the waiting room, never fabricate connection state. Games that start independently on joining use active=true and omit start.

Changing UI must preserve game protocols and polling. Rankings appear during play, not in the waiting room. Narrow displays stack the two cards while retaining the shared header height.
