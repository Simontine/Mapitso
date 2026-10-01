# LeafLink Smart Irrigation

- Frontend: React + TypeScript + Vite in `src/`; run `npm run build` for validation.
- Device: ESP32 DevKit V1 firmware in `firmware/`, built with PlatformIO Arduino.
- The browser talks to the ESP32's local REST API. Keep API payloads in `src/api.ts` and match them in `firmware/src/main.cpp`.
- Keep pump-off as the boot default; never run the pump if tank level is invalid or below the firmware's low-water limit.
- Never commit Wi-Fi credentials. Copy `firmware/src/secrets.h.example` to `firmware/src/secrets.h` locally.
- Wiring and bring-up guidance lives in `README.md`.
