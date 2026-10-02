# aquaSense Smart Irrigation

- Frontend: React + TypeScript + Vite in `src/`; run `npm run build` for validation.
- Device: ESP32 DevKit V1 firmware in `Esp32 Code/firmware/firmware.ino`, built with PlatformIO Arduino from `Esp32 Code/`.
- The browser and ESP32 communicate through Firebase Realtime Database. Keep paths and payloads in `src/api.ts` aligned with the Firebase REST contract in the firmware.
- Keep pump-off as the boot default; never run the pump if tank level is invalid or below the firmware's low-water limit.
- Never commit Wi-Fi credentials, Firebase tokens, or local TLS configuration. Copy `Esp32 Code/firmware/secrets.h.example` to `Esp32 Code/firmware/secrets.h` locally.
- Wiring and bring-up guidance lives in `README.md`.
