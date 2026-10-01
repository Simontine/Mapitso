# Fieldline Smart Irrigation

A garden irrigation controller with an ESP32 sensor/pump unit and a React dashboard. The browser and ESP32 must be on the same trusted Wi-Fi network. The controller exposes a local REST API, and the dashboard also reads the configured Firebase Realtime Database.

## Hardware assumptions

- ESP32 DevKit V1 (ESP32-WROOM-32)
- HC-SR04 ultrasonic distance sensor mounted above the reservoir
- Capacitive analog soil-moisture sensor
- DHT11 temperature/humidity module
- Relay module appropriate for the pump load
- Pump with a separate, correctly rated power supply

### Pin map

| Signal | ESP32 GPIO | Notes |
| --- | ---: | --- |
| Soil sensor analog output | 34 | ADC input-only; power the probe from 3.3 V when supported |
| HC-SR04 Trig | 23 | Sensor powered at 5 V |
| HC-SR04 Echo | 18 | Use a resistor divider or logic-level shifter to reduce 5 V Echo to 3.3 V |
| DHT11 data | 4 | Use a pull-up if the module does not include one |
| Relay input | 26 | Firmware assumes an active-low relay; change `setPump()` if yours differs. A hardware pull-up can help keep it off during reset. |

Connect sensor grounds to ESP32 ground. Never connect a pump directly to an ESP32 GPIO or power it from the board. Use a relay/driver and a separate supply rated for the pump; use appropriate flyback suppression for a DC pump. Keep water away from exposed electronics, and have a qualified person handle mains-voltage wiring.

## Firmware setup

1. Install PlatformIO (VS Code extension or PlatformIO Core).
2. Copy `firmware/src/secrets.h.example` to `firmware/src/secrets.h` and enter the 2.4 GHz Wi-Fi credentials. The local credentials file is ignored by Git.
3. Open the `firmware` folder as a PlatformIO project, then build and upload to the ESP32. Serial Monitor runs at 115200 baud.
4. On connection, the serial log prints the device IP. The dashboard default is `http://irrigation-controller.local`; if mDNS is unavailable, enter the printed IP in the dashboard's device address field.

PlatformIO Core commands from the project root:

```sh
cp firmware/src/secrets.h.example firmware/src/secrets.h
pio run -d firmware
pio run -d firmware -t upload
pio device monitor -d firmware
```

The pump relay starts OFF at boot. In auto mode the pump turns on below the configured moisture threshold and turns off after the soil recovers by 5 percentage points. Pump operation is refused when the tank level is invalid or below 18%, including in manual mode. If either sensor calibration or relay polarity differs from your hardware, test with the pump disconnected first.

### Calibration

Edit the constants near the top of `firmware/src/main.cpp` for your installation:

- `SOIL_DRY_RAW` and `SOIL_WET_RAW`: record the analog values in dry and well-watered soil; sensor outputs vary substantially.
- `TANK_EMPTY_DISTANCE_CM` and `TANK_FULL_DISTANCE_CM`: measure from the ultrasonic sensor face to the empty/full water surface.
- `TANK_LOW_LIMIT_PERCENT`: minimum safe tank percentage before the pump is inhibited.

Ultrasonic sensors can produce invalid readings from narrow tanks, angled surfaces, foam, or condensation. Verify readings against measured water levels before enabling the pump.

## Dashboard

From the project root:

```sh
npm install
npm run dev
```

Open the Vite URL, then set the ESP32 address in the **Controller connection** field if needed. Controller readings and the complete Firebase database root refresh every five seconds. Firebase values are displayed read-only and are not used to control the pump. The configured database currently includes pet location and geofence history; public read rules expose those values to anyone with the URL, so restrict the database rules if that data should not be public. A production bundle is created with `npm run build`.

The ESP32 API permits cross-origin requests and has no authentication because it is intended only for a trusted local network. Do not expose it directly to the internet or an untrusted network.

## API contract

- `GET /api/status`: current readings, validity flags, mode, threshold, and pump state.
- `POST /api/config`: JSON body `{ "moistureThreshold": 38 }` (clamped to 15-75%).
- `POST /api/control`: JSON body `{ "mode": "auto" }`, `{ "mode": "manual" }`, or `{ "mode": "manual", "pump": true }`.
