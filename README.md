# ClaimFlow / Hollard practice

A React + Vite claims prototype with demo customer and manager profiles.

## Run locally

```sh
npm install
npm run dev
```

Choose **Try demo** on the sign-in page, then a sample customer. Open a vehicle claim from the dashboard, or submit a new Vehicle claim and use the live evidence section on its detail page.

## Live vehicle evidence: first milestone

- Camera capture inside the page, with no gallery or file picker for vehicle photos.
- Four guided shots: whole vehicle, number plate, damage close-up and another angle.
- A fresh selfie follows each vehicle photo within 60 seconds. These are sequential pairs, not simultaneous front/back capture.
- A fresh browser location reading, its reported accuracy, device capture time and reported camera facing direction accompany each photo.
- Each session lasts 10 minutes. Users can review and retake pairs, cancel, or retry permission and camera failures. Leaving the tab pauses capture and discards the unfinished pair. Leaving the claim discards all unsaved photos and stops camera tracks.
- Users can submit a claim without evidence and return when it is safe. Support remains available if camera or location capture is not possible.
- Saving stores photos and metadata in IndexedDB in the current browser. Reloading restores saved evidence. Customers can delete their local evidence. The manager demo profile can review evidence saved in that same browser.
- Vehicle photo document status is reconciled against saved evidence when the claim is opened. Other document actions remain simulated.

Camera access requires **HTTPS or localhost**. Opening a plain HTTP LAN address on a phone will not enable camera capture. Use a trusted HTTPS development deployment to test on a phone. Allow both camera and location permissions. If the requested front/rear camera is unavailable, **Use available device camera** offers a desktop/device fallback; check the preview before taking each photo. Mobile hardware and browser testing is still required.

## Storage and verification limits

This milestone has no backend. A browser generates the session ID and all times and location readings are device-reported. None of these values are trusted proof of presence, the accident time, or authenticity. Camera-only UI also cannot prevent a modified client or a camera pointed at a screen.

**Verification remains pending.** No AI model, identity matching, liveness detection, manipulation detection, online image search, duplicate matching, server timestamp or insurer submission is connected. A selfie records an image only; it does not verify who the person is or that they are live.

Claims are stored in localStorage; evidence photos, selfies and precise locations are stored in IndexedDB, separately from claim summaries. Unsaved captures exist only in memory. Saved evidence remains after sign-out until the customer deletes it or site data is cleared. Browser profiles, devices and origins do not sync evidence. Use test scenes and fictional information.

The profile switcher is a demo, not authentication or an access-control boundary. Production requires real authentication, server-controlled capture sessions, secure evidence storage, retention controls and actual verification services.

## Checks

```sh
npm run lint
npm run build
npm run test:evidence
```

The evidence test uses an installed Edge, Chrome or Chromium in an isolated temporary browser profile, with synthetic camera frames and mock coordinates. It checks permission failures, consent, pair expiry and retakes, saving and quota failure recovery, reload persistence, manager read-only controls, customer separation, local deletion, interrupted sessions and camera cleanup. It does not access a real camera or location.

On machines where the browser is not in a standard location, set `BROWSER_PATH` to its executable before running the test. The test removes only its own generated temporary profile. Real phone capture, lens selection and real permission prompts need manual testing.
