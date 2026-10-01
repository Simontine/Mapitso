#include <Arduino.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <U8g2lib.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <WiFi.h>
#include <math.h>

#if __has_include("secrets.h")
#include "secrets.h"
#else
#define WIFI_SSID "YOUR_WIFI_NAME"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"
#endif

namespace {
constexpr uint8_t SOIL_PIN = 34;
constexpr uint8_t TANK_TRIG_PIN = 23;
constexpr uint8_t TANK_ECHO_PIN = 18;
constexpr uint8_t DHT_PIN = 4;
constexpr uint8_t PUMP_RELAY_PIN = 26;
constexpr uint8_t OLED_SDA_PIN = 21;
constexpr uint8_t OLED_SCL_PIN = 22;
constexpr uint8_t DHT_TYPE = DHT11;

constexpr int SOIL_DRY_RAW = 3200;
constexpr int SOIL_WET_RAW = 1400;
constexpr float TANK_EMPTY_DISTANCE_CM = 100.0f;
constexpr float TANK_FULL_DISTANCE_CM = 8.0f;
constexpr uint8_t TANK_LOW_LIMIT_PERCENT = 18;
constexpr uint32_t SENSOR_INTERVAL_MS = 2200;
constexpr uint32_t WIFI_RETRY_MS = 10000;

WebServer server(80);
DHT dht(DHT_PIN, DHT_TYPE);
U8G2_SSD1309_128X64_NONAME0_F_HW_I2C display(U8G2_R0, U8X8_PIN_NONE);

float soilPercent = 0.0f;
float tankPercent = 0.0f;
float temperatureC = NAN;
float humidityPercent = NAN;
uint8_t moistureThreshold = 38;
bool soilValid = false;
bool tankValid = false;
bool climateValid = false;
bool pumpOn = false;
String irrigationMode = "auto";
uint32_t lastSensorRead = 0;
uint32_t lastWifiAttempt = 0;

void updateDisplay() {
  char soilLine[24];
  char soilValue[5];
  char tankValue[5];
  char climateLine[24];
  char controlLine[24];

  if (soilValid) {
    snprintf(soilValue, sizeof(soilValue), "%d", static_cast<int>(roundf(soilPercent)));
  } else {
    snprintf(soilValue, sizeof(soilValue), "--");
  }
  if (tankValid) {
    snprintf(tankValue, sizeof(tankValue), "%d", static_cast<int>(roundf(tankPercent)));
  } else {
    snprintf(tankValue, sizeof(tankValue), "--");
  }

  snprintf(soilLine, sizeof(soilLine), "SOIL %s%%  TANK %s%%", soilValue, tankValue);
  if (climateValid) {
    snprintf(climateLine, sizeof(climateLine), "AIR %.0fC  RH %.0f%%", temperatureC, humidityPercent);
  } else {
    snprintf(climateLine, sizeof(climateLine), "AIR --C   RH --%%");
  }
  snprintf(controlLine, sizeof(controlLine), "PUMP %s  %s", pumpOn ? "ON" : "OFF", irrigationMode == "auto" ? "AUTO" : "MANUAL");

  display.clearBuffer();
  display.setFont(u8g2_font_6x10_tf);
  display.drawStr(0, 10, "aquaSense IRRIGATION");
  display.drawHLine(0, 13, 128);
  display.setFont(u8g2_font_5x7_tf);
  display.drawStr(0, 25, soilLine);
  display.drawStr(0, 37, climateLine);
  display.drawStr(0, 49, controlLine);

  const char *statusLine = "SYSTEM READY";
  if (!tankValid) {
    statusLine = "TANK SENSOR CHECK";
  } else if (tankPercent < TANK_LOW_LIMIT_PERCENT) {
    statusLine = "TANK LOW - PUMP LOCKED";
  } else if (irrigationMode == "auto" && !soilValid) {
    statusLine = "SOIL SENSOR CHECK";
  } else if (pumpOn) {
    statusLine = "IRRIGATION ACTIVE";
  }
  display.drawStr(0, 62, statusLine);
  display.sendBuffer();
}

void addCorsHeaders() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
  server.sendHeader("Cache-Control", "no-store");
}

void sendJson(int statusCode, JsonDocument &document) {
  String body;
  serializeJson(document, body);
  addCorsHeaders();
  server.send(statusCode, "application/json", body);
}

float readTankDistanceCm() {
  digitalWrite(TANK_TRIG_PIN, LOW);
  delayMicroseconds(3);
  digitalWrite(TANK_TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TANK_TRIG_PIN, LOW);

  const unsigned long duration = pulseIn(TANK_ECHO_PIN, HIGH, 25000UL);
  if (duration == 0) return NAN;
  return static_cast<float>(duration) * 0.0343f / 2.0f;
}

void setPump(bool requested) {
  if (requested && (!tankValid || tankPercent < TANK_LOW_LIMIT_PERCENT)) {
    requested = false;
  }
  if (requested && irrigationMode == "auto" && !soilValid) {
    requested = false;
  }

  pumpOn = requested;
  digitalWrite(PUMP_RELAY_PIN, pumpOn ? LOW : HIGH);
}

void updateSensors() {
  const int rawSoil = analogRead(SOIL_PIN);
  soilValid = rawSoil > 20 && rawSoil < 4075;
  if (soilValid) {
    const float scaled = (static_cast<float>(SOIL_DRY_RAW - rawSoil) * 100.0f) /
      static_cast<float>(SOIL_DRY_RAW - SOIL_WET_RAW);
    soilPercent = constrain(scaled, 0.0f, 100.0f);
  }

  const float distance = readTankDistanceCm();
  tankValid = !isnan(distance) && distance >= 2.0f && distance <= TANK_EMPTY_DISTANCE_CM + 10.0f;
  if (tankValid) {
    const float scaled = (TANK_EMPTY_DISTANCE_CM - distance) * 100.0f /
      (TANK_EMPTY_DISTANCE_CM - TANK_FULL_DISTANCE_CM);
    tankPercent = constrain(scaled, 0.0f, 100.0f);
  }

  const float nextTemperature = dht.readTemperature();
  const float nextHumidity = dht.readHumidity();
  climateValid = !isnan(nextTemperature) && !isnan(nextHumidity);
  if (climateValid) {
    temperatureC = nextTemperature;
    humidityPercent = nextHumidity;
  }
}

void applyAutomation() {
  if (!tankValid || tankPercent < TANK_LOW_LIMIT_PERCENT) {
    setPump(false);
    return;
  }
  if (irrigationMode != "auto") return;
  if (!soilValid) {
    setPump(false);
    return;
  }

  if (!pumpOn && soilPercent < moistureThreshold) {
    setPump(true);
  } else if (pumpOn && soilPercent >= moistureThreshold + 5) {
    setPump(false);
  }
}

void handleStatus() {
  JsonDocument response;
  response["soilPercent"] = soilValid ? roundf(soilPercent) : 0;
  response["tankPercent"] = tankValid ? roundf(tankPercent) : 0;
  if (climateValid) {
    response["temperatureC"] = temperatureC;
    response["humidityPercent"] = humidityPercent;
  } else {
    response["temperatureC"] = nullptr;
    response["humidityPercent"] = nullptr;
  }
  response["pumpOn"] = pumpOn;
  response["mode"] = irrigationMode;
  response["moistureThreshold"] = moistureThreshold;
  response["soilValid"] = soilValid;
  response["tankValid"] = tankValid;
  response["climateValid"] = climateValid;
  response["updatedAt"] = millis();
  sendJson(200, response);
}

void handleConfig() {
  JsonDocument request;
  if (deserializeJson(request, server.arg("plain"))) {
    JsonDocument response;
    response["error"] = "Invalid JSON body";
    sendJson(400, response);
    return;
  }

  if (request["moistureThreshold"].is<int>()) {
    moistureThreshold = static_cast<uint8_t>(constrain(request["moistureThreshold"].as<int>(), 15, 75));
  }
  JsonDocument response;
  response["ok"] = true;
  response["moistureThreshold"] = moistureThreshold;
  sendJson(200, response);
}

void handleControl() {
  JsonDocument request;
  if (deserializeJson(request, server.arg("plain"))) {
    JsonDocument response;
    response["error"] = "Invalid JSON body";
    sendJson(400, response);
    return;
  }

  if (request["mode"].is<const char *>()) {
    const String requestedMode = request["mode"].as<String>();
    if (requestedMode != "auto" && requestedMode != "manual") {
      JsonDocument response;
      response["error"] = "Mode must be auto or manual";
      sendJson(400, response);
      return;
    }
    irrigationMode = requestedMode;
    if (irrigationMode == "auto") setPump(false);
  }

  if (request["pump"].is<bool>()) {
    if (irrigationMode != "manual") {
      JsonDocument response;
      response["error"] = "Switch to manual mode before operating the pump";
      sendJson(409, response);
      return;
    }
    const bool requestedPump = request["pump"].as<bool>();
    if (requestedPump && (!tankValid || tankPercent < TANK_LOW_LIMIT_PERCENT)) {
      JsonDocument response;
      response["error"] = "Pump blocked: tank reading is invalid or below the safe limit";
      sendJson(409, response);
      return;
    }
    setPump(requestedPump);
  }

  applyAutomation();
  JsonDocument response;
  response["ok"] = true;
  response["pumpOn"] = pumpOn;
  response["mode"] = irrigationMode;
  sendJson(200, response);
}

void handleNotFound() {
  addCorsHeaders();
  if (server.method() == HTTP_OPTIONS) {
    server.send(204);
    return;
  }
  server.send(404, "application/json", "{\"error\":\"Not found\"}");
}

void connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.setHostname("irrigation-controller");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  lastWifiAttempt = millis();
}
} // namespace

void setup() {
  Serial.begin(115200);
  digitalWrite(PUMP_RELAY_PIN, HIGH);
  pinMode(PUMP_RELAY_PIN, OUTPUT);
  pinMode(TANK_TRIG_PIN, OUTPUT);
  pinMode(TANK_ECHO_PIN, INPUT);
  analogReadResolution(12);
  analogSetPinAttenuation(SOIL_PIN, ADC_11db);
  dht.begin();
  Wire.begin(OLED_SDA_PIN, OLED_SCL_PIN);
  display.begin();
  display.setContrast(180);
  updateDisplay();

  connectWifi();
  server.on("/api/status", HTTP_GET, handleStatus);
  server.on("/api/config", HTTP_POST, handleConfig);
  server.on("/api/control", HTTP_POST, handleControl);
  server.onNotFound(handleNotFound);
  server.begin();
  Serial.println("Irrigation API listening on port 80");
}

void loop() {
  server.handleClient();

  if (WiFi.status() == WL_CONNECTED && !MDNS.isRunning()) {
    if (MDNS.begin("irrigation-controller")) {
      Serial.print("Controller address: http://irrigation-controller.local (IP ");
      Serial.print(WiFi.localIP());
      Serial.println(")");
    }
  } else if (WiFi.status() != WL_CONNECTED && millis() - lastWifiAttempt >= WIFI_RETRY_MS) {
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    lastWifiAttempt = millis();
  }

  if (millis() - lastSensorRead >= SENSOR_INTERVAL_MS) {
    lastSensorRead = millis();
    updateSensors();
    applyAutomation();
    updateDisplay();
  }
}
