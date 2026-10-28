#!/usr/bin/env python3
"""VITOLA IQ local read-only telemetry API. No boiler write operations."""
import argparse
import copy
import datetime as dt
import json
import logging
import os
import re
from pathlib import Path
import sqlite3
import subprocess
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, parse_qs

LOG = logging.getLogger('vitola')
ROOT = Path(__file__).resolve().parent.parent
SERIES = {'boilerTemperature': ('boiler','temperature'), 'supplyTemperature': ('heating','supplyTemperature'),
          'returnTemperature': ('heating','returnTemperature'), 'hotWaterTemperature': ('hotWater','temperature'),
          'outsideTemperature': ('outside','temperature'), 'pressure': ('heating','pressure'),
          'burnerActive': ('boiler','burner')}

def stamp(epoch=None):
    return dt.datetime.fromtimestamp(epoch or time.time(), dt.timezone.utc).isoformat(timespec='seconds')

def number(value, low, high):
    try:
        if isinstance(value, bool): return None
        val = float(str(value).replace(',', '.'))
        return round(val, 2) if low <= val <= high else None
    except (TypeError, ValueError): return None

def boolean(value):
    if isinstance(value, bool): return value
    v = str(value).strip().lower()
    if v in ('1','on','true','ein','an'): return True
    if v in ('0','off','false','aus'): return False
    if v in ('0.000000','0.0'): return False
    if v in ('1.000000','1.0'): return True
    return None

def blank():
    return {'timestamp': stamp(), 'source': 'raspberry-pi', 'system': {'communication': False, 'optolink': False, 'zigbee': False, 'operatingMode': None},
            'boiler': {'temperature': None, 'burner': None, 'burnerSince': None, 'burnerRuntimeMinutes': None},
            'heating': {'supplyTemperature': None, 'returnTemperature': None, 'pressure': None, 'pump': None},
            'hotWater': {'temperature': None, 'target': None},
            'outside': {'temperature': None, 'weather': None}, 'rooms': []}

class Monitor:
    def __init__(self, config):
        self.cfg = config
        self.lock = threading.RLock()
        self.state = blank()
        self.room_cfg = config['rooms']
        self.rooms = {}
        self.last_optolink = 0
        self.last_temperature = 0
        self.last_burner = 0
        self.last_operating_mode = 0
        self.optolink_io_lock = threading.Lock()  # serialize access to the single optical interface
        self.mqtt_online = False
        self.burner_since = None
        self.burner_state = None
        self.db_path = Path(config['database'])
        self.restore_rooms()
        self.restore_pipe_temperatures()
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self.db() as db:
            db.execute('CREATE TABLE IF NOT EXISTS samples (ts INTEGER PRIMARY KEY, payload TEXT NOT NULL)')
            db.execute('CREATE INDEX IF NOT EXISTS samples_ts ON samples(ts)')

    def db(self):
        return sqlite3.connect(self.db_path, timeout=15)

    def ingest_zigbee(self, topic, payload):
        base = self.cfg['mqtt']['base_topic'].strip('/') + '/'
        if not topic.startswith(base): return False
        friendly = topic[len(base):]
        if '/' in friendly: return False  # ignore bridge, set, availability etc.
        if not isinstance(payload, dict): return False
        if friendly in ('Vorlauf', 'Ruecklauf'):
            temp = number(payload.get('temperature'), -40, 120)
            if temp is None: return False
            field = 'supplyTemperature' if friendly == 'Vorlauf' else 'returnTemperature'
            with self.lock:
                self.state['heating'][field] = round(temp, 1)
            return True
        room = next((r for r in self.room_cfg if r['friendly_name'] == friendly), None)
        if not room: return False
        temp = number(payload.get('temperature'), -40, 85)
        if temp is None: return False
        now = time.time()
        reading = {'id': room['id'], 'name': room['name'], 'temperature': round(temp, 1),
                   'target': room['target'], 'humidity': number(payload.get('humidity'), 0, 100),
                   'battery': number(payload.get('battery'), 0, 100),
                   'signal': round(number(payload.get('linkquality'), 0, 255) / 255 * 100) if number(payload.get('linkquality'), 0, 255) is not None else None,
                   'lastUpdate': stamp(now)}
        with self.lock:
            self.rooms[room['id']] = (reading, now)
        return True

    def ingest_optolink(self, raw):
        # Values are mapped by user-confirmed vclient command names; no guessed addresses.
        mapping = self.cfg['optolink'].get('fields', {})
        paths = {'boilerTemperature': ('boiler','temperature',-20,120),
                 'supplyTemperature': ('heating','supplyTemperature',-20,120),
                 'returnTemperature': ('heating','returnTemperature',-20,120),
                 'hotWaterTemperature': ('hotWater','temperature',-10,100),
                 'systemPressure': ('heating','pressure',0,6),
                 'outsideTemperature': ('outside','temperature',-50,60)}
        with self.lock:
            temperature_updated = False
            for target, (group, key, lo, hi) in paths.items():
                source = mapping.get(target)
                if source and source in raw:
                    value = number(raw[source], lo, hi)
                    if value is not None:
                        self.state[group][key] = value
                        temperature_updated = True
            if temperature_updated:
                self.last_temperature = time.time()
            source = mapping.get('burnerState')
            if source and source in raw:
                new = boolean(raw[source])
                if new is not None:
                    if new != self.burner_state: self.burner_since = time.time()
                    self.burner_state = new
                    self.last_burner = time.time()
                    self.state['boiler']['burner'] = new
                    self.state['boiler']['burnerSince'] = stamp(self.burner_since)
                    self.state['boiler']['burnerRuntimeMinutes'] = round((time.time()-self.burner_since)/60) if new else 0
            if temperature_updated or (source and source in raw and boolean(raw[source]) is not None):
                self.last_optolink = time.time()

    def current(self):
        with self.lock:
            result = copy.deepcopy(self.state)
            now = time.time()
            result['timestamp'] = stamp(now)
            freshness = max(90, self.cfg['optolink']['interval_seconds'] * 3)
            temperature_fresh = now - self.last_temperature < freshness
            burner_fresh = now - self.last_burner < freshness
            connected = temperature_fresh or burner_fresh
            mode_fresh = now - self.last_operating_mode < max(180, self.cfg['optolink']['interval_seconds'] * 4)
            result['system'] = {'communication': connected, 'optolink': connected, 'zigbee': self.mqtt_online,
                                'operatingMode': self.state['system']['operatingMode'] if mode_fresh and connected else None}
            if not temperature_fresh:
                result['boiler']['temperature'] = None
                result['hotWater']['temperature'] = None
                result['outside']['temperature'] = None
                # Zigbee pipe sensors are independent from Optolink: never clear heating temperatures here.
            if not burner_fresh:
                result['boiler']['burner'] = None
                result['boiler']['burnerSince'] = None
                result['boiler']['burnerRuntimeMinutes'] = None
            elif result['boiler']['burner'] is True and self.burner_since:
                result['boiler']['burnerRuntimeMinutes'] = round((now-self.burner_since)/60)
            result['rooms'] = []
            for room in self.room_cfg:
                record = self.rooms.get(room['id'])
                if record:
                    result['rooms'].append(copy.deepcopy(record[0]))
                else:
                    result['rooms'].append({'id': room['id'], 'name': room['name'], 'target': room['target'], 'temperature': None, 'lastUpdate': None})
            return result

    def restore_rooms(self):
        try:
            with self.db() as db:
                rows = db.execute(
                    "SELECT ts, payload FROM samples ORDER BY ts DESC LIMIT 10000"
                ).fetchall()
            found = set()
            for ts, raw in rows:
                data = json.loads(raw)
                for room in data.get('rooms', []):
                    rid = room.get('id')
                    if rid in found or rid not in {r['id'] for r in self.room_cfg}:
                        continue
                    if not isinstance(room.get('temperature'), (int, float)):
                        continue
                    configured = next(r for r in self.room_cfg if r['id'] == rid)
                    reading = dict(room)
                    reading['target'] = configured['target']
                    with self.lock:
                        self.rooms[rid] = (reading, ts)
                    found.add(rid)
                if len(found) == len(self.room_cfg):
                    break
            LOG.info("Restored %s room readings from database", len(found))
        except Exception:
            LOG.exception("Room recovery failed")

    def restore_pipe_temperatures(self):
        try:
            with self.db() as db:
                rows = db.execute(
                    'SELECT payload FROM samples ORDER BY ts DESC LIMIT 10000'
                ).fetchall()
            found = set()
            for (raw,) in rows:
                heating = json.loads(raw).get('heating', {})
                for field in ('supplyTemperature', 'returnTemperature'):
                    if field in found:
                        continue
                    value = number(heating.get(field), -40, 120)
                    if value is not None:
                        self.state['heating'][field] = value
                        found.add(field)
                if len(found) == 2:
                    break
        except Exception:
            LOG.exception('Pipe temperature recovery failed')

    def save_loop(self):
        while True:
            try:
                payload = json.dumps(self.current(), ensure_ascii=False)
                now = int(time.time())
                with self.db() as db:
                    db.execute('INSERT OR REPLACE INTO samples(ts,payload) VALUES(?,?)', (now, payload))
                    if now % 3600 < self.cfg['sample_seconds']:
                        db.execute('DELETE FROM samples WHERE ts < ?', (now - 40*86400,))
            except Exception: LOG.exception('Sample write failed')
            time.sleep(self.cfg['sample_seconds'])

    def history(self, period):
        durations = {'24h': (86400, 300), '7d': (7*86400, 900), '30d': (30*86400, 3600)}
        duration, step = durations[period]
        now = int(time.time())
        start = now-duration
        with self.db() as db:
            rows = db.execute('SELECT ts,payload FROM samples WHERE ts>=? ORDER BY ts', (start,)).fetchall()
        buckets = {}
        for ts, raw in rows:
            try: doc = json.loads(raw)
            except ValueError: continue
            end = ((ts // step) + 1) * step
            if end > now + step: continue
            buckets.setdefault(end, []).append(doc)
        timestamps, series = [], {key: [] for key in SERIES}
        room_ids = [r['id'] for r in self.room_cfg]
        rooms = {rid: [] for rid in room_ids}
        for end in sorted(buckets):
            docs = buckets[end]
            timestamps.append(stamp(end))
            for key, (group, field) in SERIES.items():
                vals = [doc.get(group, {}).get(field) for doc in docs]
                if key == 'burnerActive':
                    vals = [1 if x is True else 0 for x in vals if isinstance(x, bool)]
                else: vals = [x for x in vals if isinstance(x, (float,int)) and not isinstance(x,bool)]
                series[key].append(round(sum(vals)/len(vals), 3) if vals else None)
            for rid in room_ids:
                vals = [r.get('temperature') for doc in docs for r in doc.get('rooms', []) if r.get('id') == rid]
                vals = [v for v in vals if isinstance(v, (float,int)) and not isinstance(v,bool)]
                rooms[rid].append(round(sum(vals)/len(vals),2) if vals else None)
        return {'period': period, 'from': stamp(start), 'to': stamp(now), 'resolutionMinutes': step//60,
                'timestamps': timestamps, 'series': series, 'rooms': rooms}

    def mqtt_loop(self):
        try: import paho.mqtt.client as mqtt
        except ImportError:
            LOG.error('paho-mqtt missing; install pi/requirements.txt')
            return
        cfg = self.cfg['mqtt']
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id='vitola-iq-readonly')
        if cfg.get('username'): client.username_pw_set(cfg['username'], cfg.get('password'))
        def connect(client, userdata, flags, reason_code, properties):
            with self.lock: self.mqtt_online = not reason_code.is_failure
            if not reason_code.is_failure:
                client.subscribe(cfg['base_topic'].strip('/') + '/+', qos=0)
                LOG.info('MQTT subscribed to sensor state topics (read only)')
        def disconnect(client, userdata, flags, reason_code, properties):
            with self.lock: self.mqtt_online = False
        def message(client, userdata, msg):
            try: self.ingest_zigbee(msg.topic, json.loads(msg.payload))
            except (ValueError, UnicodeDecodeError): pass
        client.on_connect, client.on_disconnect, client.on_message = connect, disconnect, message
        while True:
            try:
                client.connect(cfg['host'], int(cfg['port']), 60)
                client.loop_forever(retry_first_connection=True)
            except Exception as exc:
                LOG.warning('MQTT unavailable: %s; retry in 10s', exc)
                with self.lock: self.mqtt_online = False
                time.sleep(10)

    def _read_optolink_commands(self, commands, group):
        """Read configured commands one at a time; a failed read must not cancel the others."""
        cfg = self.cfg['optolink']
        raw = {}
        for name in commands:
            if not name.startswith('get') or not name.replace('_', '').isalnum():
                LOG.warning('Rejected non-read Optolink command: %r', name)
                continue
            try:
                # The temperature and burner threads must never access vcontrold simultaneously.
                with self.optolink_io_lock:
                    proc = subprocess.run(
                        [cfg['vclient_path'], '-h', cfg['host'], '-p', str(cfg['port']), '-c', name],
                        capture_output=True, text=True, timeout=12, check=True)
                match = re.search(r'[-+]?\d+(?:[.,]\d+)?|\b(?:on|off|ein|aus|true|false)\b', proc.stdout, re.I)
                if match:
                    raw[name] = match.group(0)
                else:
                    LOG.warning('Optolink %s: no usable value for %s', group, name)
            except Exception as exc:
                LOG.warning('Optolink %s read failed (%s): %s', group, name, exc)
        if raw:
            self.ingest_optolink(raw)

    def operating_mode_loop(self):
        """Read the verified KW1 operating mode without changing the boiler or existing schedules."""
        cfg = self.cfg['optolink']
        if not cfg.get('enabled'):
            return
        # Independent slow poll; existing 45s temperature / +20s burner loops are unchanged.
        time.sleep(30)
        while True:
            try:
                with self.optolink_io_lock:
                    proc = subprocess.run(
                        [cfg['vclient_path'], '-h', cfg['host'], '-p', str(cfg['port']), '-c', 'getBetriebArt'],
                        capture_output=True, text=True, timeout=12, check=True)
                # vclient prints e.g. "getBetriebArt: WW" or "getBetriebArt: H+WW".
                match = re.search(r'^\s*getBetriebArt\s*:\s*(WW|RED|NORM|H\+WW FS|H\+WW|ABSCHALT|00|01|02|03|04|05)\s*$',
                                  proc.stdout, re.I | re.M)
                if match:
                    with self.lock:
                        self.state['system']['operatingMode'] = match.group(1).upper()
                        self.last_operating_mode = time.time()
                else:
                    LOG.warning('Optolink operating mode: unexpected response: %r', proc.stdout[:160])
            except Exception as exc:
                LOG.warning('Optolink operating mode read failed: %s', exc)
            time.sleep(90)

    def _optolink_schedule(self, commands, group, delay):
        interval = max(1, self.cfg['optolink']['interval_seconds'])
        next_run = time.monotonic() + delay
        while True:
            time.sleep(max(0, next_run - time.monotonic()))
            self._read_optolink_commands(commands, group)
            next_run += interval
            # If a cycle overruns, skip missed slots instead of sending back-to-back bursts.
            if next_run < time.monotonic():
                next_run += (int((time.monotonic() - next_run) // interval) + 1) * interval

    def optolink_loop(self):
        cfg = self.cfg['optolink']
        if not cfg.get('enabled'):
            LOG.info('Optolink disabled until cable and vcontrold/vclient configuration are verified')
            return
        commands = cfg.get('read_commands', [])
        burner_command = cfg.get('fields', {}).get('burnerState')
        temperature_commands = [name for name in commands if name != burner_command]
        if not temperature_commands:
            LOG.warning('No verified Optolink temperature read commands configured')
            return
        LOG.info('Optolink temperatures every %ss; burner in separate loop +20s', cfg['interval_seconds'])
        self._optolink_schedule(temperature_commands, 'temperature', 0)

    def burner_loop(self):
        cfg = self.cfg['optolink']
        if not cfg.get('enabled'):
            return
        burner_command = cfg.get('fields', {}).get('burnerState')
        if not burner_command or burner_command not in cfg.get('read_commands', []):
            LOG.warning('No verified burner read command configured; burner loop disabled')
            return
        self._optolink_schedule([burner_command], 'burner', 20)

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, directory=None, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)
    def do_POST(self): self.send_error(405, 'Read-only service')
    do_PUT = do_POST
    do_PATCH = do_POST
    do_DELETE = do_POST
    def do_GET(self):
        parsed = urlsplit(self.path)
        if not parsed.path.startswith('/api/'):
            if parsed.path.startswith('/pi/') or parsed.path.startswith('/.git') or parsed.path.startswith('/data/'):
                self.send_error(404); return
            return super().do_GET()
        try:
            monitor = self.server.monitor
            path = parsed.path
            if path == '/api/current': payload = monitor.current()
            elif path == '/api/rooms': payload = monitor.current()['rooms']
            elif path == '/api/status': payload = {'system': monitor.current()['system']}
            elif path == '/api/insights': payload = []
            elif path == '/api/weather': payload = monitor.current()['outside']
            elif path == '/api/history':
                period = parse_qs(parsed.query).get('period',['24h'])[0]
                if period not in ('24h','7d','30d'): self.send_error(400); return
                payload = monitor.history(period)
            else: self.send_error(404); return
            data = json.dumps(payload, ensure_ascii=False, allow_nan=False).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers(); self.wfile.write(data)
        except Exception:
            LOG.exception('Request failed'); self.send_error(500)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', default=str(Path(__file__).with_name('config.local.json')))
    parser.add_argument('--bind', default=None)
    parser.add_argument('--port', type=int, default=None)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
    with open(args.config, encoding='utf-8') as f: cfg = json.load(f)
    mon = Monitor(cfg)
    for target in (mon.save_loop, mon.mqtt_loop, mon.optolink_loop, mon.burner_loop, mon.operating_mode_loop):
        threading.Thread(target=target, daemon=True).start()
    server = ThreadingHTTPServer((args.bind or cfg.get('bind','127.0.0.1'), args.port or cfg.get('port',8080)), Handler)
    server.monitor = mon
    LOG.info('Read-only dashboard listening at http://%s:%d', *server.server_address)
    server.serve_forever()

if __name__ == '__main__': main()
