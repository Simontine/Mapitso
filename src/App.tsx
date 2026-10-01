import { useEffect, useState } from 'react';
import {
  Activity,
  Check,
  ChevronRight,
  CircleAlert,
  CloudSun,
  Droplets,
  Leaf,
  Power,
  RefreshCw,
  SlidersHorizontal,
  Sprout,
  Thermometer,
  Waves,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { firebaseApi, irrigationApi, type FirebaseValue, type IrrigationMode, type IrrigationStatus } from './api';

const endpointKey = 'fieldline-controller-url';
const defaultEndpoint = 'http://irrigation-controller.local';
const defaultThreshold = 38;

function reading(value: number | null | undefined, suffix = ''): string {
  return value === null || value === undefined ? '--' : `${Math.round(value)}${suffix}`;
}

function property(value: FirebaseValue | undefined, key: string): FirebaseValue | undefined {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) return value[key];
  return undefined;
}

function numericValue(value: FirebaseValue | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function percentageValue(value: FirebaseValue | undefined): number | null {
  const number = numericValue(value);
  return number !== null && number >= 0 && number <= 100 ? number : null;
}

function App() {
  const [endpoint, setEndpoint] = useState(() => localStorage.getItem(endpointKey) ?? defaultEndpoint);
  const [endpointDraft, setEndpointDraft] = useState(endpoint);
  const [status, setStatus] = useState<IrrigationStatus>();
  const [connected, setConnected] = useState(false);
  const [threshold, setThreshold] = useState(defaultThreshold);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [firebaseValues, setFirebaseValues] = useState<FirebaseValue>();
  const [firebaseError, setFirebaseError] = useState('');
  const [firebaseUpdatedAt, setFirebaseUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const next = await irrigationApi.status(endpoint);
        if (!alive) return;
        setStatus(next);
        setThreshold(next.moistureThreshold);
        setConnected(true);
        setLastUpdated(new Date());
        setMessage('');
      } catch {
        if (alive) {
          setConnected(false);
        }
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [endpoint, refreshTick]);

  useEffect(() => {
    let alive = true;
    const refreshFirebase = async () => {
      try {
        const values = await firebaseApi.values();
        if (!alive) return;
        setFirebaseValues(values);
        setFirebaseError('');
        setFirebaseUpdatedAt(new Date());
      } catch (error) {
        if (alive) setFirebaseError(error instanceof Error ? error.message : 'Could not load Firebase values');
      }
    };
    void refreshFirebase();
    const timer = window.setInterval(() => void refreshFirebase(), 5000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [refreshTick]);

  const runCommand = async (command: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setMessage('');
    try {
      await command();
      setMessage(success);
      const next = await irrigationApi.status(endpoint);
      setStatus(next);
      setConnected(true);
      setLastUpdated(new Date());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Command failed');
      setConnected(false);
    } finally {
      setBusy(false);
    }
  };

  const saveEndpoint = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = endpointDraft.trim().replace(/\/$/, '');
    if (!normalized) return;
    const url = /^https?:\/\//.test(normalized) ? normalized : `http://${normalized}`;
    localStorage.setItem(endpointKey, url);
    setEndpointDraft(url);
    setEndpoint(url);
  };

  const changeMode = (mode: IrrigationMode) => {
    void runCommand(() => irrigationApi.control(endpoint, mode), `Switched to ${mode} mode`);
  };

  const saveThreshold = () => {
    void runCommand(() => irrigationApi.configure(endpoint, threshold), 'Moisture threshold saved');
  };

  const pumpToggle = () => {
    if (!status) return;
    void runCommand(
      () => irrigationApi.control(endpoint, 'manual', !status.pumpOn),
      status.pumpOn ? 'Pump stopped' : 'Pump started',
    );
  };

  const firebaseSensorData = property(firebaseValues, 'sensorData');
  const firebaseSoil = numericValue(property(firebaseSensorData, 'soilMoisture'));
  const firebaseTank = percentageValue(property(firebaseSensorData, 'tankLevel'));
  const firebaseTemperature = numericValue(property(firebaseSensorData, 'temp'));
  const firebaseHumidity = percentageValue(property(firebaseSensorData, 'humidity'));
  const controllerSoil = status?.soilValid ? status.soilPercent : null;
  const controllerTank = status?.tankValid ? status.tankPercent : null;
  const soil = firebaseSoil ?? controllerSoil;
  const soilPercent = firebaseSoil === null ? controllerSoil : firebaseSoil >= 0 && firebaseSoil <= 100 ? firebaseSoil : null;
  const tank = firebaseTank ?? controllerTank;
  const temperature = firebaseTemperature ?? (status?.climateValid ? status.temperatureC : null);
  const humidity = firebaseHumidity ?? (status?.climateValid ? status.humidityPercent : null);
  const tankLow = tank !== null && tank < 18;

  return (
    <main className="app-shell">
      <aside className="rail" aria-label="Main navigation">
        <a className="brand-mark" href="#overview" aria-label="Fieldline home"><Sprout size={22} strokeWidth={2.1} /></a>
        <div className="rail-rule" />
        <a className="rail-link active" href="#overview" aria-label="Overview" title="Overview"><Activity size={19} /></a>
        <a className="rail-link" href="#sensors" aria-label="Sensors" title="Sensors"><Waves size={19} /></a>
        <a className="rail-link" href="#controls" aria-label="Controls" title="Controls"><SlidersHorizontal size={19} /></a>
        <div className="rail-bottom"><span className={`connection-dot ${connected ? 'online' : ''}`} /></div>
      </aside>

      <section className="workspace" id="overview">
        <header className="topbar">
          <div className="brand-lockup"><span className="brand-name">fieldline</span><span className="brand-divider" /><span className="site-name">GARDEN / NORTH BED</span></div>
          <div className="topbar-right">
            <span className={`connection-state ${connected ? 'is-online' : ''}`}>
              {connected ? <Wifi size={15} /> : <WifiOff size={15} />}
              {connected ? 'Controller online' : 'Controller offline'}
            </span>
            <span className="topbar-date">{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Waiting for data'}</span>
          </div>
        </header>

        <div className="content">
          <section className="intro-row">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" /> LIVE SYSTEM</div>
              <h1>Good morning,<br /><em>let’s grow.</em></h1>
              <p className="intro-copy">Your garden at a glance. Soil, water, and climate in one place.</p>
            </div>
            <div className={`system-badge ${connected ? 'badge-live' : ''}`}>
              <span className="badge-icon">{connected ? <Check size={16} /> : <CircleAlert size={16} />}</span>
              <span><strong>{connected ? (status?.pumpOn ? 'Watering now' : 'System ready') : 'No connection'}</strong><small>{connected ? `Irrigation ${status?.mode ?? 'auto'} mode` : 'Check controller address'}</small></span>
            </div>
          </section>

          <section className="metric-strip" id="sensors" aria-label="Live sensor readings">
            <article className="metric metric-soil">
              <div className="metric-heading"><span className="metric-icon"><Leaf size={17} /></span><span>SOIL MOISTURE</span><span className="live-tick" /></div>
              <div className="metric-value">{reading(soil, soilPercent === null ? '' : '%')}</div>
              <div className="metric-foot"><span>{soil === null ? 'Awaiting sensor' : soilPercent === null ? 'Raw Firebase reading' : soilPercent < threshold ? 'Below target' : 'Within target'}</span><span>{soilPercent === null ? 'Sensor value' : `Target ${threshold}%`}</span></div>
              {soilPercent !== null && <div className="meter"><span style={{ width: `${soilPercent}%` }} /></div>}
            </article>
            <article className={`metric metric-tank ${tankLow ? 'metric-warning' : ''}`}>
              <div className="metric-heading"><span className="metric-icon"><Droplets size={17} /></span><span>WATER RESERVE</span><span className="live-tick" /></div>
              <div className="metric-value">{reading(tank, '%')}</div>
              <div className="metric-foot"><span>{tankLow ? 'Refill soon' : tank === null ? 'Awaiting sensor' : 'Tank level'}</span><span>Low at 18%</span></div>
              <div className="meter"><span style={{ width: `${tank ?? 0}%` }} /></div>
            </article>
            <article className="metric metric-climate">
              <div className="metric-heading"><span className="metric-icon"><CloudSun size={17} /></span><span>MICROCLIMATE</span><span className="live-tick" /></div>
              <div className="climate-values"><div><strong>{reading(temperature, '°')}</strong><span>C</span><small><Thermometer size={13} /> TEMP</small></div><i /><div><strong>{reading(humidity, '%')}</strong><small><Waves size={13} /> HUMIDITY</small></div></div>
              <div className="metric-foot"><span>{temperature !== null || humidity !== null ? 'Air conditions' : 'Awaiting sensor'}</span><span>Live readings</span></div>
            </article>
          </section>

          <div className="section-heading"><div><span className="eyebrow">CONTROL DECK</span><h2>Water, thoughtfully.</h2></div><button className="icon-button" title="Refresh readings" aria-label="Refresh readings" onClick={() => setRefreshTick((tick) => tick + 1)}><RefreshCw size={16} /></button></div>

          <section className="control-grid" id="controls">
            <article className="control-panel mode-panel">
              <div className="panel-top"><div><span className="panel-kicker">01 / IRRIGATION</span><h3>Choose a rhythm</h3></div><span className="panel-icon"><Sprout size={18} /></span></div>
              <p className="panel-copy">Let soil moisture guide the pump, or take the wheel yourself.</p>
              <div className="mode-switch" role="group" aria-label="Irrigation mode">
                <button className={status?.mode !== 'manual' ? 'selected' : ''} disabled={!connected || busy} onClick={() => changeMode('auto')}><Activity size={15} /> Auto</button>
                <button className={status?.mode === 'manual' ? 'selected' : ''} disabled={!connected || busy} onClick={() => changeMode('manual')}><SlidersHorizontal size={15} /> Manual</button>
              </div>
              <div className="panel-divider" />
              <div className="pump-row"><div><strong>Water pump</strong><span>{status?.pumpOn ? 'Running' : 'Standby'}{tankLow ? ' · Tank low' : ''}</span></div><button className={`pump-button ${status?.pumpOn ? 'pump-active' : ''}`} onClick={pumpToggle} disabled={!connected || busy || tankLow || tank === null} aria-label={status?.pumpOn ? 'Stop pump' : 'Start pump'}><Power size={17} /><span>{status?.pumpOn ? 'Stop' : 'Start'}</span></button></div>
              {tankLow && <p className="safety-note"><CircleAlert size={14} /> Pump locked until the reservoir is refilled.</p>}
            </article>

            <article className="control-panel threshold-panel">
              <div className="panel-top"><div><span className="panel-kicker">02 / SOIL TARGET</span><h3>Set the dry point</h3></div><span className="panel-icon panel-icon-lime"><Droplets size={18} /></span></div>
              <p className="panel-copy">Auto mode starts watering when moisture falls below your target.</p>
              <div className="threshold-readout"><strong>{threshold}<small>%</small></strong><span>moisture threshold</span></div>
              <input className="threshold-slider" type="range" min="15" max="75" step="1" value={threshold} style={{ background: `linear-gradient(90deg, #95b86c 0%, #95b86c ${((threshold - 15) / 60) * 100}%, #dfe4d7 ${((threshold - 15) / 60) * 100}%, #dfe4d7 100%)` }} onChange={(event) => setThreshold(Number(event.target.value))} aria-label="Moisture threshold" />
              <div className="slider-labels"><span>DRIER</span><span>WETTER</span></div>
              <button className="save-button" onClick={saveThreshold} disabled={!connected || busy}><span>{busy ? 'Saving…' : 'Save threshold'}</span><ChevronRight size={16} /></button>
            </article>
          </section>

          <section className="connection-panel">
            <div className="connection-panel-icon"><Wifi size={17} /></div>
            <div className="connection-info"><strong>Controller connection</strong><span>Same Wi-Fi network · ESP32 REST API</span></div>
            <form className="endpoint-form" onSubmit={saveEndpoint}><label htmlFor="endpoint">DEVICE ADDRESS</label><div className="endpoint-input-wrap"><input id="endpoint" value={endpointDraft} onChange={(event) => setEndpointDraft(event.target.value)} spellCheck={false} /><button type="submit" title="Save device address" aria-label="Save device address"><Check size={16} /></button></div></form>
          </section>
          <section className="firebase-panel" aria-label="Firebase values">
            <div className="firebase-heading">
              <div><span className="eyebrow">REALTIME DATABASE</span><h2>Firebase values</h2></div>
              <span>{firebaseError || (firebaseUpdatedAt ? `Updated ${firebaseUpdatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Loading values…')}</span>
            </div>
            <pre className="firebase-json" aria-live="polite">{firebaseValues === undefined ? (firebaseError || 'Loading values…') : JSON.stringify(firebaseValues, null, 2)}</pre>
          </section>
          {message && <div className="toast" role="status">{message}</div>}
          <footer className="footer"><span>FIELDLINE <i>·</i> LOCAL CONTROL</span><span><span className={`footer-dot ${connected ? 'online' : ''}`} />{connected ? 'DATA STREAM ACTIVE' : 'RECONNECTING'} <button onClick={() => setRefreshTick((tick) => tick + 1)} aria-label="Retry connection"><RefreshCw size={12} /></button></span></footer>
        </div>
      </section>
    </main>
  );
}

export default App;
