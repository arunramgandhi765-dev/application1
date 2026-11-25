"""Edutech: same-origin FastAPI website, catalog, accounts and practice APIs."""
from collections import defaultdict, deque
from contextlib import asynccontextmanager, contextmanager
from pathlib import Path
from threading import Lock
from urllib.parse import urlsplit
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import time

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, field_validator

ROOT = Path(__file__).resolve().parent.parent
for line in (ROOT / '.env').read_text().splitlines() if (ROOT / '.env').exists() else []:
    line = line.strip()
    if line and not line.startswith('#') and '=' in line:
        key, value = line.split('=', 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))

CATALOG = json.loads((ROOT / 'app/catalog.json').read_text(encoding='utf-8'))
CHALLENGES = json.loads((ROOT / 'app/challenges.json').read_text(encoding='utf-8'))
DB_PATH = Path(os.getenv('EDUTECH_DB_PATH', str(ROOT / 'data/edutech.db')))
if not DB_PATH.is_absolute():
    DB_PATH = ROOT / DB_PATH
SECURE_COOKIE = os.getenv('EDUTECH_COOKIE_SECURE', 'false').lower() == 'true'
PUBLIC_ORIGIN = os.getenv('EDUTECH_PUBLIC_ORIGIN', '').rstrip('/')
COOKIE = 'edutech_session'
SESSION_SECONDS = 60 * 60 * 24 * 7
PBKDF2_ROUNDS = 600_000
RATE_LOCK = Lock()
RATE_BUCKETS = defaultdict(deque)


@contextmanager
def database():
    con = sqlite3.connect(DB_PATH, timeout=10)
    con.row_factory = sqlite3.Row
    con.execute('PRAGMA foreign_keys = ON')
    try:
        yield con
        con.commit()
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()


@asynccontextmanager
async def lifespan(app):
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with database() as con:
        con.execute('PRAGMA journal_mode=WAL')
        con.executescript('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS saved_courses (
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                course_slug TEXT NOT NULL, PRIMARY KEY(user_id, course_slug));
            CREATE TABLE IF NOT EXISTS enquiries (
                id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                name TEXT NOT NULL, email TEXT NOT NULL, topic TEXT NOT NULL,
                message TEXT NOT NULL, created_at INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS community_posts (
                id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                body TEXT NOT NULL, created_at INTEGER NOT NULL);
        ''')
        con.execute('DELETE FROM sessions WHERE expires_at < ?', (int(time.time()),))
    yield


def documented_header(x_requested_with: str = Header(default='Edutech', alias='X-Requested-With', description='Required value for POST/DELETE: Edutech.')):
    """Expose the mutation header in Swagger; middleware enforces it."""
    return x_requested_with


app = FastAPI(title='Edutech API', version='1.0.0', lifespan=lifespan, dependencies=[Depends(documented_header)],
              description='Catalog, session authentication, saved courses, enquiries and practice. POST/DELETE requests require X-Requested-With: Edutech. Same-origin cookie authentication.')


@app.middleware('http')
async def browser_security(request: Request, call_next):
    if request.url.path.startswith('/api/') and request.method in {'POST', 'PUT', 'PATCH', 'DELETE'}:
        if request.headers.get('x-requested-with') != 'Edutech':
            return JSONResponse({'detail': 'Include the X-Requested-With: Edutech header.'}, status_code=403)
        origin = request.headers.get('origin')
        allowed_origin = PUBLIC_ORIGIN or str(request.base_url).rstrip('/')
        if origin and origin != allowed_origin:
            return JSONResponse({'detail': 'This request must come from the Edutech website.'}, status_code=403)
        if request.headers.get('sec-fetch-site') == 'cross-site':
            return JSONResponse({'detail': 'Cross-site requests are not permitted.'}, status_code=403)
        try:
            if int(request.headers.get('content-length', 0)) > 65536:
                return JSONResponse({'detail': 'Request is too large.'}, status_code=413)
        except ValueError:
            return JSONResponse({'detail': 'Invalid request length.'}, status_code=400)
    response = await call_next(request)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy'] = 'same-origin'
    response.headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()'
    if request.url.path.startswith('/api/'):
        response.headers['Cache-Control'] = 'no-store'
    return response


def rate_limit(request, category, maximum=10, seconds=300):
    # Single-process starter limit. Use a shared rate-limit store for multiple workers.
    now = time.monotonic()
    key = (request.client.host if request.client else 'unknown', category)
    with RATE_LOCK:
        if len(RATE_BUCKETS) > 10000:
            for old_key in list(RATE_BUCKETS):
                if not RATE_BUCKETS[old_key] or RATE_BUCKETS[old_key][-1] < now - 600:
                    del RATE_BUCKETS[old_key]
        bucket = RATE_BUCKETS[key]
        while bucket and bucket[0] < now - seconds:
            bucket.popleft()
        if len(bucket) >= maximum:
            raise HTTPException(429, 'Too many attempts. Please try again in a few minutes.', headers={'Retry-After': str(seconds)})
        bucket.append(now)


def find_item(collection, slug):
    item = next((item for item in CATALOG[collection] if item['slug'] == slug), None)
    if item is None:
        raise HTTPException(404, 'This item was not found.')
    return item


def password_hash(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), PBKDF2_ROUNDS).hex()
    return f'{salt}${digest}'


def public_user(row):
    return {key: row[key] for key in ('id', 'name', 'email')}


def current_user(request, required=True):
    token = request.cookies.get(COOKIE, '')
    row = None
    if token and len(token) < 200:
        with database() as con:
            row = con.execute('''SELECT users.* FROM users JOIN sessions ON sessions.user_id=users.id
                WHERE sessions.token_hash=? AND sessions.expires_at>?''',
                (hashlib.sha256(token.encode()).hexdigest(), int(time.time()))).fetchone()
    if row is None and required:
        raise HTTPException(401, 'Please log in to continue.')
    return public_user(row) if row else None


def start_session(user_id, request, response):
    token = secrets.token_urlsafe(32)
    old_token = request.cookies.get(COOKIE, '')
    with database() as con:
        if old_token:
            con.execute('DELETE FROM sessions WHERE token_hash=?', (hashlib.sha256(old_token.encode()).hexdigest(),))
        con.execute('DELETE FROM sessions WHERE expires_at<?', (int(time.time()),))
        con.execute('INSERT INTO sessions VALUES (?, ?, ?)',
                    (hashlib.sha256(token.encode()).hexdigest(), user_id, int(time.time()) + SESSION_SECONDS))
    response.set_cookie(COOKIE, token, max_age=SESSION_SECONDS, httponly=True,
                        secure=SECURE_COOKIE, samesite='strict', path='/')


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid')


class EmailModel(StrictModel):
    email: str = Field(min_length=3, max_length=254)

    @field_validator('email')
    @classmethod
    def email_format(cls, value):
        value = value.strip().lower()
        if not re.fullmatch(r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+", value):
            raise ValueError('Enter a valid email address.')
        return value


class Login(EmailModel):
    password: str = Field(min_length=1, max_length=128)


class Signup(Login):
    name: str = Field(min_length=2, max_length=80)
    password: str = Field(min_length=12, max_length=128)

    @field_validator('name')
    @classmethod
    def clean_name(cls, value):
        value = value.strip()
        if len(value) < 2:
            raise ValueError('Enter your name.')
        return value


class Enquiry(EmailModel):
    name: str = Field(min_length=2, max_length=80)
    topic: str = Field(min_length=1, max_length=80)
    message: str = Field(min_length=10, max_length=2000)

    @field_validator('name', 'topic', 'message')
    @classmethod
    def not_blank(cls, value):
        if not value.strip():
            raise ValueError('This field cannot be blank.')
        return value.strip()


class SavedCourse(StrictModel):
    course_slug: str = Field(max_length=80)


class SQLQuery(StrictModel):
    query: str = Field(min_length=1, max_length=5000)


class CommunityPost(StrictModel):
    body: str = Field(min_length=5, max_length=1000)

    @field_validator('body')
    @classmethod
    def clean_body(cls, value):
        if len(value.strip()) < 5:
            raise ValueError('Write at least 5 characters.')
        return value.strip()


class CompilerRun(StrictModel):
    language_id: int = Field(gt=0)
    source_code: str = Field(min_length=1, max_length=20000)
    stdin: str = Field(default='', max_length=5000)


@app.get('/api/health', tags=['System'])
def health():
    return {'status': 'ok', 'service': 'Edutech'}


@app.get('/api/catalog', tags=['Catalog'])
def catalog():
    return CATALOG


@app.get('/api/courses', tags=['Catalog'])
def courses(q: str = ''):
    return [item for item in CATALOG['courses'] if q.lower() in (item['name'] + item['description']).lower()]


@app.get('/api/courses/{slug}', tags=['Catalog'])
def course(slug: str):
    return find_item('courses', slug)


@app.get('/api/practice', tags=['Practice'])
def practice():
    return CATALOG['practice']


@app.get('/api/practice/{slug}/challenges', tags=['Practice'])
def challenges(slug: str):
    find_item('practice', slug)
    return CHALLENGES.get(slug, [])


@app.get('/api/practice/{slug}', tags=['Practice'])
def practice_detail(slug: str):
    return find_item('practice', slug)


@app.get('/api/products', tags=['Catalog'])
def products():
    return CATALOG['products']


@app.get('/api/products/{slug}', tags=['Catalog'])
def product(slug: str):
    return find_item('products', slug)


@app.get('/api/resources', tags=['Catalog'])
def resources():
    return CATALOG['resources']


@app.get('/api/resources/{slug}', tags=['Catalog'])
def resource_detail(slug: str):
    return find_item('resources', slug)


@app.get('/api/community', tags=['Community'])
def community_posts():
    with database() as con:
        return [dict(row) for row in con.execute('''SELECT p.id, p.user_id, u.name, p.body, p.created_at
            FROM community_posts p JOIN users u ON u.id=p.user_id ORDER BY p.id DESC LIMIT 100''')]


@app.post('/api/community', status_code=201, tags=['Community'])
def create_post(payload: CommunityPost, request: Request):
    user = current_user(request)
    rate_limit(request, 'community', 5, 60)
    now = int(time.time())
    with database() as con:
        cur = con.execute('INSERT INTO community_posts (user_id, body, created_at) VALUES (?, ?, ?)', (user['id'], payload.body, now))
        post_id = cur.lastrowid
    return {'id': post_id, 'user_id': user['id'], 'name': user['name'], 'body': payload.body, 'created_at': now}


@app.delete('/api/community/{post_id}', status_code=204, tags=['Community'])
def delete_post(post_id: int, request: Request):
    user = current_user(request)
    with database() as con:
        cur = con.execute('DELETE FROM community_posts WHERE id=? AND user_id=?', (post_id, user['id']))
        if not cur.rowcount:
            raise HTTPException(404, 'Post not found, or it belongs to another account.')
    return Response(status_code=204)


@app.post('/api/auth/signup', status_code=201, tags=['Authentication'])
def signup(payload: Signup, request: Request, response: Response):
    rate_limit(request, 'signup', 5)
    encoded = password_hash(payload.password)
    try:
        with database() as con:
            cur = con.execute('INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)',
                              (payload.name, payload.email, encoded, int(time.time())))
            user_id = cur.lastrowid
    except sqlite3.IntegrityError:
        raise HTTPException(409, 'An account with this email already exists.')
    start_session(user_id, request, response)
    return {'id': user_id, 'name': payload.name, 'email': payload.email}


@app.post('/api/auth/login', tags=['Authentication'])
def login(payload: Login, request: Request, response: Response):
    rate_limit(request, 'login', 10)
    with database() as con:
        row = con.execute('SELECT * FROM users WHERE email=?', (payload.email,)).fetchone()
    stored = row['password_hash'] if row else '00' * 16 + '$' + '00' * 32
    candidate = password_hash(payload.password, stored.split('$')[0])
    if not hmac.compare_digest(stored, candidate) or row is None:
        raise HTTPException(401, 'Email or password is incorrect.')
    start_session(row['id'], request, response)
    return public_user(row)


@app.get('/api/auth/me', tags=['Authentication'])
def me(request: Request):
    return current_user(request)


@app.post('/api/auth/logout', status_code=204, tags=['Authentication'])
def logout(request: Request):
    token = request.cookies.get(COOKIE, '')
    with database() as con:
        con.execute('DELETE FROM sessions WHERE token_hash=?', (hashlib.sha256(token.encode()).hexdigest(),))
    response = Response(status_code=204)
    response.delete_cookie(COOKIE, path='/', secure=SECURE_COOKIE, httponly=True, samesite='strict')
    return response


@app.get('/api/me/saved-courses', tags=['My learning'])
def saved_courses(request: Request):
    user = current_user(request)
    with database() as con:
        slugs = {r['course_slug'] for r in con.execute('SELECT course_slug FROM saved_courses WHERE user_id=?', (user['id'],))}
    return [c for c in CATALOG['courses'] if c['slug'] in slugs]


@app.post('/api/me/saved-courses', status_code=201, tags=['My learning'])
def save_course(payload: SavedCourse, request: Request):
    user = current_user(request)
    item = find_item('courses', payload.course_slug)
    with database() as con:
        con.execute('INSERT OR IGNORE INTO saved_courses VALUES (?, ?)', (user['id'], item['slug']))
    return item


@app.delete('/api/me/saved-courses/{slug}', status_code=204, tags=['My learning'])
def remove_course(slug: str, request: Request):
    user = current_user(request)
    with database() as con:
        con.execute('DELETE FROM saved_courses WHERE user_id=? AND course_slug=?', (user['id'], slug))
    return Response(status_code=204)


@app.post('/api/enquiries', status_code=201, tags=['Enquiries'])
def create_enquiry(payload: Enquiry, request: Request):
    rate_limit(request, 'enquiry', 5)
    user = current_user(request, required=False)
    with database() as con:
        cur = con.execute('INSERT INTO enquiries (user_id, name, email, topic, message, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            (user['id'] if user else None, payload.name, payload.email, payload.topic, payload.message, int(time.time())))
        reference = cur.lastrowid
    return {'reference': reference, 'message': 'Your enquiry has been recorded.', 'email_sent': False}


@app.get('/api/me/enquiries', tags=['Enquiries'])
def my_enquiries(request: Request):
    user = current_user(request)
    with database() as con:
        return [dict(row) for row in con.execute('SELECT id, topic, message, created_at FROM enquiries WHERE user_id=? ORDER BY id DESC', (user['id'],))]


@app.post('/api/practice/sqlkata/run', tags=['Practice'])
def run_sql(payload: SQLQuery, request: Request):
    rate_limit(request, 'sql', 60, 60)
    con = sqlite3.connect(':memory:')
    try:
        con.executescript('''
            CREATE TABLE departments (id INTEGER PRIMARY KEY, name TEXT);
            INSERT INTO departments VALUES (1, 'Engineering'), (2, 'Design'), (3, 'Analytics');
            CREATE TABLE employees (id INTEGER PRIMARY KEY, name TEXT, department_id INTEGER, salary INTEGER);
            INSERT INTO employees VALUES (1, 'Ananya', 1, 60000), (2, 'Arjun', 2, 48000),
                (3, 'Kavya', 1, 72000), (4, 'Ravi', 3, 55000), (5, 'Meera', 3, 68000);
        ''')
        safe_functions = {'count','sum','avg','min','max','round','abs','lower','upper','length','substr','substring','coalesce','ifnull','nullif','trim','ltrim','rtrim','replace','typeof','total','printf','like','glob'}
        def authorizer(action, first, second, dbname, trigger):
            if action in {sqlite3.SQLITE_SELECT, sqlite3.SQLITE_RECURSIVE}:
                return sqlite3.SQLITE_OK
            if action == sqlite3.SQLITE_READ and first in {'employees', 'departments'}:
                return sqlite3.SQLITE_OK
            if action == sqlite3.SQLITE_FUNCTION and (second or '').lower() in safe_functions:
                return sqlite3.SQLITE_OK
            return sqlite3.SQLITE_DENY
        con.setlimit(sqlite3.SQLITE_LIMIT_LENGTH, 65536)
        con.setlimit(sqlite3.SQLITE_LIMIT_COLUMN, 30)
        con.set_authorizer(authorizer)
        started = time.monotonic()
        con.set_progress_handler(lambda: int(time.monotonic() - started > 0.3), 1000)
        cur = con.execute(payload.query)
        rows = cur.fetchmany(101)
        return {'columns': [d[0] for d in cur.description], 'rows': rows[:100], 'truncated': len(rows) > 100}
    except sqlite3.Error as exc:
        raise HTTPException(400, f'Query could not run: {exc}. Use a single SELECT query on employees or departments.')
    finally:
        con.close()


def compiler_config():
    base = os.getenv('JUDGE0_URL', '').rstrip('/')
    if not base:
        raise HTTPException(503, 'Additional languages are not connected yet. JavaScript is available in your browser.')
    if urlsplit(base).scheme != 'https':
        raise HTTPException(503, 'The compiler service must use HTTPS.')
    headers = {}
    if os.getenv('JUDGE0_API_KEY'):
        headers['X-RapidAPI-Key'] = os.environ['JUDGE0_API_KEY']
    if os.getenv('JUDGE0_RAPIDAPI_HOST'):
        headers['X-RapidAPI-Host'] = os.environ['JUDGE0_RAPIDAPI_HOST']
    return base, headers


@app.get('/api/compiler/languages', tags=['Compiler'])
async def compiler_languages():
    local = {'id': 'javascript', 'name': 'JavaScript (browser)'}
    if not os.getenv('JUDGE0_URL'):
        return {'languages': [local], 'remote_available': False}
    base, headers = compiler_config()
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            result = await client.get(f'{base}/languages', headers=headers)
            result.raise_for_status()
            languages = result.json()
            if not isinstance(languages, list):
                raise ValueError('Invalid language list')
        return {'languages': [local] + [{'id': x['id'], 'name': x['name']} for x in languages], 'remote_available': True}
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        return {'languages': [local], 'remote_available': False, 'message': 'The additional compiler service is temporarily unavailable.'}


@app.post('/api/compiler/run', tags=['Compiler'])
async def compile_remote(payload: CompilerRun, request: Request):
    rate_limit(request, 'compiler', 10, 60)
    base, headers = compiler_config()
    current_user(request)
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            result = await client.post(f'{base}/submissions', params={'wait': 'true', 'base64_encoded': 'false'}, headers=headers,
                json={**payload.model_dump(), 'cpu_time_limit': 2, 'wall_time_limit': 3, 'memory_limit': 64000,
                      'enable_network': False, 'max_file_size': 128})
            result.raise_for_status()
            data = result.json()
        return {key: data.get(key) for key in ['stdout', 'stderr', 'compile_output', 'status', 'message']}
    except (httpx.HTTPError, ValueError, AttributeError):
        raise HTTPException(502, 'The compiler service could not complete this run. Please try again later.')


app.mount('/static', StaticFiles(directory=ROOT / 'static'), name='static')


@app.get('/favicon.ico', include_in_schema=False)
def favicon():
    return FileResponse(ROOT / 'static/favicon.svg', media_type='image/svg+xml')


@app.get('/service-worker.js', include_in_schema=False)
def service_worker():
    return FileResponse(ROOT / 'static/service-worker.js', media_type='text/javascript', headers={'Cache-Control': 'no-cache'})


@app.get('/{page:path}', include_in_schema=False)
def website(page: str):
    page = page.rstrip('/')
    valid = {'', 'courses', 'practice', 'resources', 'products', 'login', 'signup', 'dashboard', 'contact'}
    for group in ['courses', 'practice', 'products', 'resources']:
        valid.update(f'{group}/{item["slug"]}' for item in CATALOG[group])
    if page not in valid:
        if page.startswith('api/') or page == 'api':
            raise HTTPException(404, 'API endpoint not found.')
        return HTMLResponse('<!doctype html><title>Page not found | Edutech</title><body style="background:#080f15;color:#f5e8c7;font:20px system-ui;padding:10vw"><h1>Page not found</h1><p>This Edutech page does not exist.</p><a style="color:#ecc566" href="/">Return to the homepage</a></body>', status_code=404)
    return FileResponse(ROOT / 'static/index.html')
