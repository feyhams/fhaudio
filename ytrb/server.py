"""
FH Audio - Local Development & Media Stream Server
Serves static files and provides a zero-cost local bridge for yt-dlp real audio streaming.
"""

import http.server
import socketserver
import urllib.parse
import subprocess
import os
import sys
import shutil
import json
import base64
import re
import time

PORT = 5500
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.join(DIRECTORY, '.cache_audio')
DATA_DIR = os.path.join(DIRECTORY, 'data')
AUDIO_DIR = os.path.join(DATA_DIR, 'audio')
HISTORY_FILE = os.path.join(DATA_DIR, 'history.json')
ACCOUNTS_FILE = os.path.join(DATA_DIR, 'accounts.json')
SETTINGS_FILE = os.path.join(DATA_DIR, 'settings.json')

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(AUDIO_DIR, exist_ok=True)

class FHAudioHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/api/fetch-audio':
            qs = urllib.parse.parse_qs(parsed.query)
            target_url = qs.get('url', [''])[0]
            if not target_url:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b'Missing url parameter')
                return

            try:
                os.makedirs(CACHE_DIR, exist_ok=True)
                ytdlp_path = os.path.join(DIRECTORY, 'yt-dlp.exe')
                if not os.path.exists(ytdlp_path):
                    ytdlp_path = 'yt-dlp'

                # Extract video ID via regex immediately (0ms)
                m = re.search(r'(?:v=|youtu\.be/|embed/|shorts/)([a-zA-Z0-9_-]{11})', target_url)
                video_id = m.group(1) if m else ''

                cached_file = None
                if video_id:
                    for ext in ['webm', 'm4a', 'mp3', 'ogg', 'opus', 'aac']:
                        check_p = os.path.join(CACHE_DIR, f"{video_id}.{ext}")
                        if os.path.exists(check_p) and os.path.getsize(check_p) > 10000:
                            cached_file = check_p
                            break

                if not cached_file:
                    # Download direct audio stream with yt-dlp
                    out_template = os.path.join(CACHE_DIR, "%(id)s.%(ext)s")
                    dl_cmd = [
                        ytdlp_path,
                        '--no-warnings',
                        '-f', 'ba/b',
                        '--no-playlist',
                        '-o', out_template,
                        target_url
                    ]
                    subprocess.run(dl_cmd, capture_output=True, text=True, timeout=60)
                    
                    if video_id:
                        for ext in ['webm', 'm4a', 'mp3', 'ogg', 'opus', 'aac']:
                            check_p = os.path.join(CACHE_DIR, f"{video_id}.{ext}")
                            if os.path.exists(check_p) and os.path.getsize(check_p) > 10000:
                                cached_file = check_p
                                break

                if cached_file and os.path.exists(cached_file):
                    file_size = os.path.getsize(cached_file)
                    ext = os.path.splitext(cached_file)[1].lower()
                    mime_types = {
                        '.webm': 'audio/webm',
                        '.m4a': 'audio/mp4',
                        '.mp3': 'audio/mpeg',
                        '.ogg': 'audio/ogg',
                        '.opus': 'audio/opus'
                    }
                    content_type = mime_types.get(ext, 'audio/mpeg')
                    
                    self.send_response(200)
                    self.send_header('Content-Type', content_type)
                    self.send_header('Content-Length', str(file_size))
                    self.end_headers()

                    with open(cached_file, 'rb') as f:
                        shutil.copyfileobj(f, self.wfile)
                    return
                else:
                    self.send_response(500)
                    self.end_headers()
                    self.wfile.write(b'Failed to download audio track')
                    return

            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(f'Server Error: {str(e)}'.encode())
                return

        elif parsed.path == '/api/video-info':
            qs = urllib.parse.parse_qs(parsed.query)
            target_url = qs.get('url', [''])[0]
            if not target_url:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b'{"error": "Missing url"}')
                return
            try:
                ytdlp_path = os.path.join(DIRECTORY, 'yt-dlp.exe')
                if not os.path.exists(ytdlp_path):
                    ytdlp_path = 'yt-dlp'
                m = re.search(r'(?:v=|youtu\.be/|embed/|shorts/)([a-zA-Z0-9_-]{11})', target_url)
                video_id = m.group(1) if m else ''

                res = subprocess.run([ytdlp_path, '--no-warnings', '--print', '%(id)s|||%(title)s|||%(duration)s|||%(chapters)j|||%(description)s', target_url], capture_output=True, text=True, timeout=25)
                out = res.stdout.strip()
                parts = out.split('|||', 4)
                vid = parts[0] if len(parts) > 0 and parts[0] != 'NA' else video_id
                title = parts[1] if len(parts) > 1 and parts[1] != 'NA' else 'YouTube Audio'
                raw_dur = parts[2] if len(parts) > 2 else '0'
                try:
                    duration = float(raw_dur) if raw_dur not in ('NA', '') else 0.0
                except:
                    duration = 0.0

                raw_chap = parts[3] if len(parts) > 3 else 'NA'
                raw_desc = parts[4] if len(parts) > 4 else ''

                chapters = []
                if raw_chap and raw_chap != 'NA':
                    try:
                        chapters = json.loads(raw_chap)
                    except:
                        chapters = []

                # Fallback: Auto-extract chapters from video description if creator didn't make official chapters
                if (not chapters or len(chapters) == 0) and raw_desc:
                    def parse_time_str(ts):
                        p = [int(x) for x in ts.strip().replace('[', '').replace(']', '').replace('(', '').replace(')', '').split(':')]
                        if len(p) == 2: return p[0] * 60 + p[1]
                        if len(p) == 3: return p[0] * 3600 + p[1] * 60 + p[2]
                        return 0

                    time_rx = re.compile(r'(?:\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?)')
                    parsed_tracks = []
                    for dline in raw_desc.split('\n'):
                        dline = dline.strip()
                        if not dline: continue
                        tm = time_rx.search(dline)
                        if tm:
                            t_sec = parse_time_str(tm.group(1))
                            t_title = dline.replace(tm.group(0), '')
                            t_title = re.sub(r'^[\|\:\–\—\-\.\/\s]+', '', t_title)
                            t_title = re.sub(r'[\|\:\–\—\-\.\/\s]+$', '', t_title)
                            t_title = re.sub(r'^\d+[\.\)\-]\s*', '', t_title).strip()
                            if not t_title: t_title = f'Track at {tm.group(1)}'
                            parsed_tracks.append({'start_time': float(t_sec), 'title': t_title})

                    if len(parsed_tracks) >= 2:
                        parsed_tracks.sort(key=lambda x: x['start_time'])
                        # Remove duplicates
                        uniq = []
                        for pt in parsed_tracks:
                            if not any(u['start_time'] == pt['start_time'] for u in uniq):
                                uniq.append(pt)
                        for i in range(len(uniq)):
                            if i < len(uniq) - 1:
                                uniq[i]['end_time'] = uniq[i + 1]['start_time']
                            else:
                                uniq[i]['end_time'] = duration if duration > uniq[i]['start_time'] else uniq[i]['start_time'] + 210.0
                        chapters = uniq

                resp = {
                    "success": True,
                    "id": vid,
                    "title": title,
                    "duration": duration,
                    "chapters": chapters,
                    "thumbnail": f"https://img.youtube.com/vi/{vid}/hqdefault.jpg" if vid else ""
                }
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(resp).encode('utf-8'))
                return
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode('utf-8'))
                return

        elif parsed.path == '/api/open-folder':
            qs = urllib.parse.parse_qs(parsed.query)
            filename = qs.get('file', [''])[0]
            downloads_dir = os.path.join(os.environ.get('USERPROFILE', os.path.expanduser('~')), 'Downloads')
            target_path = os.path.normpath(os.path.join(downloads_dir, filename)) if filename else downloads_dir
            try:
                if filename and os.path.exists(target_path):
                    subprocess.Popen(f'explorer.exe /select,"{target_path}"', shell=True)
                else:
                    subprocess.Popen(f'explorer.exe "{downloads_dir}"', shell=True)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(b'{"status":"ok"}')
            except Exception as ex:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(str(ex).encode())
        elif parsed.path == '/api/history':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            if os.path.exists(HISTORY_FILE):
                with open(HISTORY_FILE, 'rb') as f:
                    self.wfile.write(f.read())
            else:
                self.wfile.write(b'[]')
            return

        elif parsed.path == '/api/accounts':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            if os.path.exists(ACCOUNTS_FILE):
                with open(ACCOUNTS_FILE, 'rb') as f:
                    self.wfile.write(f.read())
            else:
                self.wfile.write(b'[]')
            return

        elif parsed.path == '/api/settings':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            if os.path.exists(SETTINGS_FILE):
                with open(SETTINGS_FILE, 'rb') as f:
                    self.wfile.write(f.read())
            else:
                self.wfile.write(b'{}')
            return

        elif parsed.path == '/api/audio-blob':
            qs = urllib.parse.parse_qs(parsed.query)
            key = qs.get('id', [''])[0]
            clean_key = re.sub(r'[^a-zA-Z0-9_-]', '', key)
            if not clean_key:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b'Missing key')
                return
            audio_path = os.path.join(AUDIO_DIR, f"{clean_key}.ogg")
            if os.path.exists(audio_path) and os.path.getsize(audio_path) > 0:
                self.send_response(200)
                self.send_header('Content-Type', 'audio/ogg')
                self.send_header('Content-Length', str(os.path.getsize(audio_path)))
                self.end_headers()
                with open(audio_path, 'rb') as f:
                    shutil.copyfileobj(f, self.wfile)
                return
            else:
                self.send_response(404)
                self.end_headers()
                return

        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/api/roblox-upload':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            
            try:
                data = json.loads(post_data.decode('utf-8'))
                api_key = data.get('apiKey', '')
                asset_name = data.get('assetName', 'Audio')
                creator_type = data.get('creatorType', 'userId')
                creator_id = str(data.get('creatorId', '0'))
                audio_base64 = data.get('audioBase64', '')

                if not api_key:
                    self.send_response(400)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(b'{"success": false, "error": "Missing API Key"}')
                    return

                audio_bytes = base64.b64decode(audio_base64) if audio_base64 else b''
                os.makedirs(CACHE_DIR, exist_ok=True)
                temp_audio_path = os.path.join(CACHE_DIR, 'temp_upload.ogg')
                with open(temp_audio_path, 'wb') as tf:
                    tf.write(audio_bytes)

                c_field = 'groupId' if str(creator_type).lower() in ('group', 'groupid') else 'userId'

                json_meta = json.dumps({
                    "assetType": "Audio",
                    "displayName": asset_name[:50],
                    "description": "In-game background audio and atmospheric music",
                    "creationContext": {
                        "creator": {
                            c_field: creator_id
                        }
                    }
                })

                curl_cmd = [
                    'curl.exe', '-s', '-X', 'POST', 'https://apis.roblox.com/assets/v1/assets',
                    '-H', f'x-api-key: {api_key}',
                    '-F', f'request={json_meta};type=application/json',
                    '-F', f'fileContent=@{temp_audio_path};type=audio/ogg'
                ]

                res = subprocess.run(curl_cmd, capture_output=True, text=True, timeout=30)
                resp_text = (res.stdout or '').strip() or (res.stderr or '').strip()
                print(f"[ROBLOX API] Response: {resp_text}")

                match = re.search(r'"path":"([^"]+)"', resp_text)
                if match:
                    op_path = match.group(1)
                    check_url = f"https://apis.roblox.com/assets/v1/{op_path}"
                    asset_id = ""

                    for _ in range(8):
                        time.sleep(2)
                        chk_cmd = ['curl.exe', '-s', '-H', f'x-api-key: {api_key}', check_url]
                        chk_res = subprocess.run(chk_cmd, capture_output=True, text=True, timeout=10)
                        try:
                            chk_json = json.loads(chk_res.stdout)
                            if chk_json.get('done'):
                                resp_obj = chk_json.get('response', {})
                                asset_id = resp_obj.get('assetId', '')
                                raw_mod = resp_obj.get('moderationResult', {}).get('moderationState', '')
                                raw_lower = raw_mod.lower() if raw_mod else ''
                                if 'approved' in raw_lower:
                                    mod_status = 'approved'
                                elif 'rejected' in raw_lower or 'blocked' in raw_lower:
                                    mod_status = 'rejected'
                                elif 'reviewing' in raw_lower:
                                    mod_status = 'reviewing'
                                elif asset_id:
                                    mod_status = 'approved'
                                else:
                                    mod_status = 'rejected'
                                break
                        except Exception:
                            pass

                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({
                        "success": True,
                        "assetId": asset_id,
                        "status": mod_status,
                        "operationPath": op_path
                    }).encode())
                    return
                else:
                    self.send_response(400)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    err_msg = resp_text
                    try:
                        err_json = json.loads(resp_text)
                        if 'message' in err_json:
                            err_msg = err_json['message']
                    except Exception:
                        pass
                    self.wfile.write(json.dumps({
                        "success": False,
                        "error": err_msg or "Roblox API upload error"
                    }).encode())
                    return
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode())
                return

        elif parsed.path == '/api/check-operation':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            try:
                data = json.loads(post_data.decode('utf-8'))
                api_key = data.get('apiKey', '')
                op_path = data.get('operationPath', '')
                if not op_path or not api_key:
                    self.send_response(400)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(b'{"success":false,"error":"Missing operationPath or apiKey"}')
                    return

                check_url = f"https://apis.roblox.com/assets/v1/{op_path}"
                chk_cmd = ['curl.exe', '-s', '-H', f'x-api-key: {api_key}', check_url]
                chk_res = subprocess.run(chk_cmd, capture_output=True, text=True, timeout=10)
                try:
                    chk_json = json.loads(chk_res.stdout)
                    done = chk_json.get('done', False)
                    resp_obj = chk_json.get('response', {})
                    asset_id = resp_obj.get('assetId', '')
                    raw_mod = resp_obj.get('moderationResult', {}).get('moderationState', '')
                    
                    raw_lower = raw_mod.lower() if raw_mod else ''
                    if not done or 'reviewing' in raw_lower:
                        status = 'reviewing'
                    elif 'approved' in raw_lower:
                        status = 'approved'
                    elif 'rejected' in raw_lower or 'blocked' in raw_lower:
                        status = 'rejected'
                    elif asset_id:
                        status = 'approved'
                    else:
                        status = 'rejected'

                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({
                        "success": True,
                        "done": done,
                        "assetId": asset_id,
                        "status": status
                    }).encode())
                    return
                except Exception as ex_parse:
                    self.send_response(500)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"success":False,"error":str(ex_parse)}).encode())
                    return
            except Exception as ex:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"success":False,"error":str(ex)}).encode())
        elif parsed.path == '/api/save-and-open':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            try:
                data = json.loads(post_data.decode('utf-8'))
                filename = data.get('filename', 'audio.ogg')
                audio_base64 = data.get('audioBase64', '')
                open_explorer = data.get('openExplorer', True)
                downloads_dir = os.path.join(os.environ.get('USERPROFILE', os.path.expanduser('~')), 'Downloads')
                os.makedirs(downloads_dir, exist_ok=True)
                target_path = os.path.normpath(os.path.join(downloads_dir, filename))

                if audio_base64:
                    audio_bytes = base64.b64decode(audio_base64)
                    with open(target_path, 'wb') as f:
                        f.write(audio_bytes)

                if open_explorer:
                    if os.path.exists(target_path):
                        subprocess.Popen(f'explorer.exe /select,"{target_path}"', shell=True)
                    else:
                        subprocess.Popen(f'explorer.exe "{downloads_dir}"', shell=True)

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(b'{"status":"ok"}')
            except Exception as ex:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status":"error", "error": str(ex)}).encode())
            return

        elif parsed.path == '/api/history':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            try:
                parsed_json = json.loads(post_data.decode('utf-8'))
                with open(HISTORY_FILE, 'w', encoding='utf-8') as f:
                    json.dump(parsed_json, f, indent=2, ensure_ascii=False)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(b'{"status":"ok"}')
            except Exception as ex:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status":"error", "error": str(ex)}).encode())
            return

        elif parsed.path == '/api/accounts':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            try:
                parsed_json = json.loads(post_data.decode('utf-8'))
                with open(ACCOUNTS_FILE, 'w', encoding='utf-8') as f:
                    json.dump(parsed_json, f, indent=2, ensure_ascii=False)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(b'{"status":"ok"}')
            except Exception as ex:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status":"error", "error": str(ex)}).encode())
            return

        elif parsed.path == '/api/settings':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            try:
                parsed_json = json.loads(post_data.decode('utf-8'))
                with open(SETTINGS_FILE, 'w', encoding='utf-8') as f:
                    json.dump(parsed_json, f, indent=2, ensure_ascii=False)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(b'{"status":"ok"}')
            except Exception as ex:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status":"error", "error": str(ex)}).encode())
            return

        elif parsed.path == '/api/save-audio':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            try:
                data = json.loads(post_data.decode('utf-8'))
                key = data.get('key', '')
                audio_base64 = data.get('audioBase64', '')
                clean_key = re.sub(r'[^a-zA-Z0-9_-]', '', key)
                if clean_key and audio_base64:
                    audio_bytes = base64.b64decode(audio_base64)
                    target_path = os.path.join(AUDIO_DIR, f"{clean_key}.ogg")
                    with open(target_path, 'wb') as f:
                        f.write(audio_bytes)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(b'{"status":"ok"}')
            except Exception as ex:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status":"error", "error": str(ex)}).encode())
            return

        self.send_response(404)
        self.end_headers()

if __name__ == '__main__':
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(('0.0.0.0', PORT), FHAudioHandler) as httpd:
        print(f"FH Audio Server running at http://localhost:{PORT}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            httpd.server_close()
