# GiftRelayer — Business Offer + Mini App flow

GiftRelayer keeps Telegram Business as the delivery layer and moves the actual deal flow into a Telegram Mini App.

## New flow

1. Buyer writes `.buy https://t.me/nft/RareBird-3396 8000 звёзды` in a Business chat.
2. GiftRelayer validates it, creates the offer, sends the formatted offer, then deletes the `.buy` message when Telegram permits it.
3. Telegram offer has only two actions: `Отклонить` and `Принять`.
4. `Принять` is a Telegram Mini App direct link. It does **not** set `ACCEPTED`.
5. Mini App validates `Telegram.WebApp.initData` on the backend and loads the selected offer.
6. Only the real recipient can accept/decline. The creator cannot accept their own offer.
7. On Mini App accept: `ACTIVE -> ACCEPTED`.
8. Seller transfers the gift, returns to the Mini App and presses `Подтвердить передачу`.
9. Backend uses `getUserGifts` for Telegram-native unique gifts, excluding blockchain-assigned gifts.
10. If the gift is absent from seller and present on the expected buyer: `ACCEPTED -> TRANSFER_CONFIRMED`.
11. If still on seller: Mini App shows `Подарок ещё не передан` and keeps the deal open.
12. If official verification is unavailable/ambiguous: `ACCEPTED -> TRANSFER_PENDING` and admin gets manual review buttons.

## Security

- `offer_id/startapp` selects an object; it is not authentication.
- Every Mini App API call validates Telegram `initData` HMAC server-side.
- `auth_date` has an expiration window.
- User ID is taken only from validated initData.
- Offer state changes are server-side and transactional.
- The creator is blocked from accepting their own offer on the backend.
- Frontend never decides that a transfer succeeded.

## Telegram Business Mini App button detail

Bot API `web_app` inline buttons are not supported for messages sent on behalf of a Business account. GiftRelayer therefore uses an ordinary URL inline button pointing to the bot's official Telegram Mini App direct link:

`https://t.me/<bot>/<app-short-name>?startapp=<offer_id>`

Telegram opens the Mini App and supplies signed `initData`; the backend verifies it before any action.

## Added web layer

- `webapp.py` — aiohttp API/server
- `web/index.html` — Mini App shell
- `web/styles.css` — mobile Telegram-like premium UI
- `web/app.js` — state-driven Mini App client
- `utils/webapp_auth.py` — official initData HMAC validation
- `services/message_sync.py` — synchronization of Telegram offer messages

The same Python process runs both the bot polling loop and the HTTP Mini App server.
