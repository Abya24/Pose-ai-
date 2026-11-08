# RevenueCat — integrated (2026-06)
This file is supposed to serve as a memory to you if you have to interact with user's RevenueCat account via integration proxy at any later point in time.

## Identifiers (from /setup response — copy verbatim)
- rc_project_id: projb5a96dd8
- apple_app_id: appa5f07c16c4
- play_app_id: appbc74d045d8
- entitlement_lookup_key: pro
- offering_lookup_key: default
- Packages (package -> product_id, current price):
  - $rc_monthly -> prod668e86453d   (₹199 / $2.99, P1M, trial: none)
  - $rc_annual  -> prodd864ce1a91   (₹1,499 / $19.99, P1Y, trial: none)
- Dashboard: https://app.revenuecat.com/projects/projb5a96dd8
- App identity: Purchases.logIn(deviceId) — app has no login; device id is stable per install (storage key pm.device). Restore Purchases recovers on reinstall.
- Free limit (client-side only): 3 AI edits/day (enhance, remove/blur/replace bg) — storage key pm.ai.<date>

## Check for project_state in revenuecat status api response. if the project_state is less then project_created, re-fetch RevenueCat playbook via the integration expert tool.
Status check:
`curl -sS -H "$AUTH" "$INTEGRATION_PROXY_URL/internal/revenuecat/projects/8e56046f-249d-4e45-b003-b2fd92383018/status"`

## Later updates to user's products (integration proxy apis ONLY — NEVER call the RevenueCat REST API)
- Upsert: POST $INTEGRATION_PROXY_URL/internal/revenuecat/projects/8e56046f-249d-4e45-b003-b2fd92383018/products
  body: {"products":[{"package":"$rc_monthly","price":199,"currency":"INR","period":"P1M","prices":[{"amount_micros":199000000,"currency":"INR"}]}]}
- Remove: DELETE .../products/%24rc_monthly
- Recover identifiers / repopulate .env: re-run the idempotent /setup call.

## Taking in-app purchases LIVE — store-side steps (USER does these)
- Upload App Store Connect API key / IAP key and Google Play service-account JSON in the RevenueCat dashboard
- Set up payment profiles in App Store Connect and Play Console
- Create matching subscription products with the SAME product IDs shown in RevenueCat
- Release build → test via TestFlight / Play internal testing → submit
All steps are in the FAQ section of the payments panel.
