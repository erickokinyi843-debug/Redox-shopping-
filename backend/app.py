from __future__ import annotations

import json
import hmac
import hashlib
import os
import re
import secrets
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request
from flask_cors import CORS

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / 'data'
DATA_DIR.mkdir(exist_ok=True)

LISTINGS_FILE = DATA_DIR / 'listings.json'
WANTED_FILE = DATA_DIR / 'wanted.json'
ORDERS_FILE = DATA_DIR / 'orders.json'
SELLER_VERIFICATIONS_FILE = DATA_DIR / 'seller_verifications.json'
ACCOUNTS_FILE = DATA_DIR / 'accounts.json'
AUTH_SESSIONS_FILE = DATA_DIR / 'auth_sessions.json'
MESSAGES_FILE = DATA_DIR / 'messages.json'
CONTENT_FILES = {
    'events': DATA_DIR / 'events.json',
    'rentals': DATA_DIR / 'rentals.json',
    'services': DATA_DIR / 'services.json',
    'accommodation': DATA_DIR / 'accommodation.json'
}
CONTENT_REQUIRED_FIELDS = {
    'events': ('title', 'description', 'date', 'startTime', 'venue', 'area', 'organizer', 'email'),
    'rentals': ('title', 'description', 'price', 'pricePeriod', 'category', 'ownerName', 'email'),
    'services': ('title', 'description', 'skill', 'providerName', 'email'),
    'accommodation': ('title', 'details', 'price', 'type', 'location', 'contactName', 'email')
}

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 8 * 1024 * 1024
cors_origins = [
    origin.strip()
    for origin in os.environ.get(
        'CORS_ORIGINS',
        'http://localhost:3000,http://127.0.0.1:3000,http://localhost:5000,http://127.0.0.1:5000,http://localhost:5500,http://127.0.0.1:5500'
    ).split(',')
    if origin.strip()
]
CORS(app, resources={r"/api/*": {"origins": cors_origins}})


@app.errorhandler(413)
def request_too_large(_error):
    return jsonify({'error': 'Request is too large. Images and verification documents must be no larger than 5 MB.'}), 413


def read_json(path: Path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except (ValueError, OSError):
        return default


def write_json(path: Path, value):
    path.write_text(json.dumps(value, indent=2), encoding='utf-8')


def public_account(account):
    return {
        'fullname': account.get('fullname', ''),
        'email': account.get('email', ''),
        'phone': account.get('phone', ''),
        'createdAt': account.get('createdAt', ''),
        'status': account.get('status', 'active')
    }


def create_session(email):
    token = secrets.token_urlsafe(32)
    sessions = read_json(AUTH_SESSIONS_FILE, {})
    if not isinstance(sessions, dict):
        sessions = {}
    sessions[hashlib.sha256(token.encode('utf-8')).hexdigest()] = email
    write_json(AUTH_SESSIONS_FILE, sessions)
    return token


def authenticated_account():
    if hasattr(g, 'account'):
        return g.account
    token = request.headers.get('Authorization', '')
    if not token.startswith('Bearer '):
        return None
    token_hash = hashlib.sha256(token[7:].encode('utf-8')).hexdigest()
    sessions = read_json(AUTH_SESSIONS_FILE, {})
    email = sessions.get(token_hash) if isinstance(sessions, dict) else None
    accounts = read_json(ACCOUNTS_FILE, {})
    account = accounts.get(email) if isinstance(accounts, dict) and email else None
    if not account or account.get('status', 'active') != 'active':
        return None
    g.account = account
    return account


def require_account():
    account = authenticated_account()
    if not account:
        return None, (jsonify({'error': 'A valid, active account session is required.'}), 401)
    return account, None


def account_token_hashes(email):
    sessions = read_json(AUTH_SESSIONS_FILE, {})
    if not isinstance(sessions, dict):
        return {}
    remaining = {
        token_hash: session_email
        for token_hash, session_email in sessions.items()
        if session_email != email
    }
    return remaining


def create_message(thread, sender, text):
    now = datetime.now(timezone.utc).isoformat()
    thread.setdefault('messages', []).append({
        'sender': sender,
        'text': text,
        'createdAt': now,
        'readBy': [sender]
    })
    thread['lastUpdated'] = now


@app.get('/api/health')
def health():
    return jsonify({
        'status': 'ok',
        'message': 'Marketplace API is online.',
        'timestamp': datetime.now(timezone.utc).isoformat()
    })


@app.post('/api/auth/register')
def register_account():
    payload = request.get_json(silent=True) or {}
    fullname = str(payload.get('fullname') or '').strip()
    email = str(payload.get('email') or '').strip().lower()
    phone = str(payload.get('phone') or '').strip()
    password = payload.get('password')
    if (
        not fullname
        or not re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', email)
        or not isinstance(password, str)
        or len(password) < 6
    ):
        return jsonify({'error': 'A full name, valid email, and password of at least 6 characters are required.'}), 400

    accounts = read_json(ACCOUNTS_FILE, {})
    if not isinstance(accounts, dict):
        accounts = {}
    if email in accounts:
        return jsonify({'error': 'An account with this email already exists. Sign in instead.'}), 409

    salt = secrets.token_bytes(16)
    accounts[email] = {
        'fullname': fullname,
        'email': email,
        'phone': phone,
        'createdAt': datetime.now(timezone.utc).isoformat(),
        'salt': salt.hex(),
        'passwordHash': hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 120000).hex(),
        'status': 'active'
    }
    write_json(ACCOUNTS_FILE, accounts)
    return jsonify({'account': public_account(accounts[email]), 'token': create_session(email)}), 201


@app.post('/api/auth/login')
def login_account():
    payload = request.get_json(silent=True) or {}
    email = str(payload.get('email') or '').strip().lower()
    password = payload.get('password')
    accounts = read_json(ACCOUNTS_FILE, {})
    account = accounts.get(email) if isinstance(accounts, dict) else None
    if not account:
        return jsonify({'error': 'No shared account was found for this email.'}), 404
    if account.get('status', 'active') != 'active':
        return jsonify({'error': 'This account has been suspended. Contact support for help.'}), 403
    try:
        salt = bytes.fromhex(account['salt'])
        expected_hash = account['passwordHash']
    except (KeyError, TypeError, ValueError):
        app.logger.error('Stored account credentials are invalid for %s.', email)
        return jsonify({'error': 'This account could not be verified. Contact support.'}), 500
    password_hash = hashlib.pbkdf2_hmac('sha256', str(password or '').encode('utf-8'), salt, 120000).hex()
    if not hmac.compare_digest(password_hash, expected_hash):
        return jsonify({'error': 'Invalid email or password. Please try again.'}), 401
    return jsonify({'account': public_account(account), 'token': create_session(email)})


@app.post('/api/auth/import')
def import_legacy_account():
    payload = request.get_json(silent=True) or {}
    email = str(payload.get('email') or '').strip().lower()
    salt = str(payload.get('salt') or '')
    password_hash = str(payload.get('passwordHash') or '')
    fullname = str(payload.get('fullname') or '').strip()
    if (
        not re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', email)
        or not re.fullmatch(r'[0-9a-fA-F]{32}', salt)
        or not re.fullmatch(r'[0-9a-fA-F]{64}', password_hash)
        or not fullname
    ):
        return jsonify({'error': 'The existing browser account could not be imported.'}), 400

    accounts = read_json(ACCOUNTS_FILE, {})
    if not isinstance(accounts, dict):
        accounts = {}
    if email in accounts:
        if accounts[email].get('status', 'active') != 'active':
            return jsonify({'error': 'This account has been suspended. Contact support for help.'}), 403
        return jsonify({'error': 'A shared account already exists for this email. Sign in instead.'}), 409
    try:
        valid_legacy_hash = hmac.compare_digest(
            hashlib.pbkdf2_hmac(
                'sha256',
                str(payload.get('password') or '').encode('utf-8'),
                bytes.fromhex(salt),
                120000
            ).hex(),
            password_hash.lower()
        )
    except ValueError:
        valid_legacy_hash = False
    if not valid_legacy_hash:
        return jsonify({'error': 'The existing browser account could not be verified.'}), 401

    account = {
        'fullname': fullname,
        'email': email,
        'phone': str(payload.get('phone') or '').strip(),
        'createdAt': str(payload.get('createdAt') or datetime.now(timezone.utc).isoformat()),
        'salt': salt.lower(),
        'passwordHash': password_hash.lower(),
        'status': 'active'
    }
    accounts[email] = account
    write_json(ACCOUNTS_FILE, accounts)
    return jsonify({'account': public_account(account), 'token': create_session(email)})


@app.route('/api/content/<content_type>', methods=['GET', 'POST'])
def marketplace_content(content_type):
    if content_type not in CONTENT_FILES:
        return jsonify({'error': 'Unknown content type.'}), 404

    content_file = CONTENT_FILES[content_type]
    if request.method == 'GET':
        content = read_json(content_file, [])
        return jsonify(content if isinstance(content, list) else [])

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({'error': 'A JSON object is required.'}), 400
    missing_fields = [
        field for field in CONTENT_REQUIRED_FIELDS[content_type]
        if not str(payload.get(field) or '').strip()
    ]
    if missing_fields:
        return jsonify({'error': f"Required fields are missing: {', '.join(missing_fields)}."}), 400

    content = read_json(content_file, [])
    if not isinstance(content, list):
        content = []
    post = {
        **payload,
        'id': payload.get('id') or f"{content_type}-{int(datetime.now(timezone.utc).timestamp() * 1000)}",
        'createdAt': datetime.now(timezone.utc).isoformat()
    }
    content.insert(0, post)
    write_json(content_file, content)
    return jsonify(post), 201


@app.post('/api/admin/content/<content_type>')
def admin_create_content(content_type):
    authorization_error = require_admin_key()
    if authorization_error:
        return authorization_error
    return marketplace_content(content_type)


@app.get('/api/listings')
def get_listings():
    listings = read_json(LISTINGS_FILE, [])
    if not isinstance(listings, list):
        listings = []
    return jsonify(listings)


@app.post('/api/listings')
def create_listing():
    payload = request.get_json(silent=True) or {}
    title = str(payload.get('title') or '').strip()
    price = payload.get('price')
    category = str(payload.get('category') or '').strip()
    description = str(payload.get('description') or '').strip()

    if not title or not price or not category or not description:
        return jsonify({'error': 'title, price, category, and description are required.'}), 400

    listings = read_json(LISTINGS_FILE, [])
    item = {
        'id': payload.get('id') or f"listing-{int(datetime.now(timezone.utc).timestamp() * 1000)}",
        'title': title,
        'price': price,
        'category': category,
        'description': description,
        'town': str(payload.get('town') or '').strip(),
        'businessName': str(payload.get('businessName') or '').strip(),
        'sellerName': str(payload.get('sellerName') or '').strip(),
        'sellerEmail': str(payload.get('sellerEmail') or '').strip(),
        'sellerPhone': str(payload.get('sellerPhone') or '').strip(),
        'studentMarketplace': bool(payload.get('studentMarketplace')),
        'createdAt': datetime.now(timezone.utc).isoformat(),
        'sellerVerified': bool(payload.get('sellerVerified')),
        'verificationStatus': str(payload.get('verificationStatus') or 'Unverified seller'),
        'image': payload.get('image') or ''
    }
    listings.insert(0, item)
    write_json(LISTINGS_FILE, listings)
    return jsonify(item), 201


@app.post('/api/admin/listings')
def admin_create_listing():
    authorization_error = require_admin_key()
    if authorization_error:
        return authorization_error
    return create_listing()


@app.get('/api/wanted')
def get_wanted_posts():
    posts = read_json(WANTED_FILE, [])
    if not isinstance(posts, list):
        posts = []
    return jsonify(posts)


@app.post('/api/wanted')
def create_wanted_post():
    payload = request.get_json(silent=True) or {}
    title = str(payload.get('title') or '').strip()
    description = str(payload.get('description') or '').strip()
    buyer_email = str(payload.get('buyerEmail') or '').strip()

    if not title or not description or not buyer_email:
        return jsonify({'error': 'title, description, and buyerEmail are required.'}), 400

    posts = read_json(WANTED_FILE, [])
    post = {
        'id': payload.get('id') or f"wanted-{int(datetime.now(timezone.utc).timestamp() * 1000)}",
        'title': title,
        'category': str(payload.get('category') or 'General').strip(),
        'budget': str(payload.get('budget') or '').strip(),
        'town': str(payload.get('town') or '').strip(),
        'urgency': str(payload.get('urgency') or 'Flexible').strip(),
        'description': description,
        'buyerName': str(payload.get('buyerName') or 'Community member').strip(),
        'buyerEmail': buyer_email,
        'buyerPhone': str(payload.get('buyerPhone') or '').strip(),
        'createdAt': datetime.now(timezone.utc).isoformat()
    }
    posts.insert(0, post)
    write_json(WANTED_FILE, posts)
    return jsonify(post), 201


@app.get('/api/orders')
def get_orders():
    orders = read_json(ORDERS_FILE, [])
    if not isinstance(orders, list):
        orders = []
    return jsonify(orders)


@app.post('/api/orders')
def create_order():
    payload = request.get_json(silent=True) or {}
    if not payload.get('customerName') or not payload.get('items'):
        return jsonify({'error': 'customerName and items are required.'}), 400

    orders = read_json(ORDERS_FILE, [])
    order = {
        'id': payload.get('id') or f"order-{int(datetime.now(timezone.utc).timestamp() * 1000)}",
        'customerName': str(payload.get('customerName') or '').strip(),
        'email': str(payload.get('email') or '').strip(),
        'phone': str(payload.get('phone') or '').strip(),
        'items': payload['items'],
        'total': payload.get('total', 0),
        'status': payload.get('status', 'Placed'),
        'fulfillmentMethod': payload.get('fulfillmentMethod', 'Pickup'),
        'fulfillmentLocation': str(payload.get('fulfillmentLocation') or '').strip(),
        'createdAt': datetime.now(timezone.utc).isoformat(),
    }
    orders.insert(0, order)
    write_json(ORDERS_FILE, orders)
    return jsonify(order), 201


def require_admin_key():
    configured_key = os.environ.get('ADMIN_API_KEY', '')
    if not configured_key:
        return jsonify({'error': 'Admin API access is not configured on the server.'}), 503
    supplied_key = request.headers.get('X-Admin-Key', '')
    if not hmac.compare_digest(supplied_key.encode('utf-8'), configured_key.encode('utf-8')):
        return jsonify({'error': 'A valid admin API key is required.'}), 401
    return None


@app.get('/api/admin/accounts')
def get_admin_accounts():
    authorization_error = require_admin_key()
    if authorization_error:
        return authorization_error
    accounts = read_json(ACCOUNTS_FILE, {})
    if not isinstance(accounts, dict):
        accounts = {}
    return jsonify(sorted(
        (public_account(account) for account in accounts.values()),
        key=lambda account: account.get('createdAt', ''),
        reverse=True
    ))


@app.patch('/api/admin/accounts/<path:email>')
def update_admin_account(email):
    authorization_error = require_admin_key()
    if authorization_error:
        return authorization_error
    normalized_email = email.strip().lower()
    payload = request.get_json(silent=True) or {}
    status = str(payload.get('status') or '').strip().lower()
    if status not in {'active', 'suspended'}:
        return jsonify({'error': 'status must be active or suspended.'}), 400
    accounts = read_json(ACCOUNTS_FILE, {})
    if not isinstance(accounts, dict) or normalized_email not in accounts:
        return jsonify({'error': 'Account was not found.'}), 404
    accounts[normalized_email]['status'] = status
    write_json(ACCOUNTS_FILE, accounts)
    if status == 'suspended':
        write_json(AUTH_SESSIONS_FILE, account_token_hashes(normalized_email))
    return jsonify({'account': public_account(accounts[normalized_email])})


@app.delete('/api/admin/accounts/<path:email>')
def delete_admin_account(email):
    authorization_error = require_admin_key()
    if authorization_error:
        return authorization_error
    normalized_email = email.strip().lower()
    accounts = read_json(ACCOUNTS_FILE, {})
    if not isinstance(accounts, dict) or normalized_email not in accounts:
        return jsonify({'error': 'Account was not found.'}), 404
    del accounts[normalized_email]
    write_json(ACCOUNTS_FILE, accounts)
    write_json(AUTH_SESSIONS_FILE, account_token_hashes(normalized_email))
    verifications = read_json(SELLER_VERIFICATIONS_FILE, {})
    if isinstance(verifications, dict) and normalized_email in verifications:
        del verifications[normalized_email]
        write_json(SELLER_VERIFICATIONS_FILE, verifications)
    threads = read_json(MESSAGES_FILE, {})
    if isinstance(threads, dict):
        threads = {
            thread_id: thread for thread_id, thread in threads.items()
            if normalized_email not in thread.get('participants', [])
        }
        write_json(MESSAGES_FILE, threads)
    return jsonify({'deleted': normalized_email})


@app.get('/api/admin/support')
def get_admin_support_threads():
    authorization_error = require_admin_key()
    if authorization_error:
        return authorization_error
    threads = read_json(MESSAGES_FILE, {})
    if not isinstance(threads, dict):
        threads = {}
    return jsonify(sorted(
        (thread for thread in threads.values() if thread.get('support')),
        key=lambda thread: thread.get('lastUpdated', ''),
        reverse=True
    ))


@app.post('/api/admin/support/<path:thread_id>/messages')
def admin_reply_to_support(thread_id):
    authorization_error = require_admin_key()
    if authorization_error:
        return authorization_error
    payload = request.get_json(silent=True) or {}
    text = str(payload.get('text') or '').strip()
    if not text or len(text) > 500:
        return jsonify({'error': 'A message of 1 to 500 characters is required.'}), 400
    threads = read_json(MESSAGES_FILE, {})
    thread = threads.get(thread_id) if isinstance(threads, dict) else None
    if not thread or not thread.get('support'):
        return jsonify({'error': 'Support conversation was not found.'}), 404
    create_message(thread, 'support@rodyx.local', text)
    threads[thread_id] = thread
    write_json(MESSAGES_FILE, threads)
    return jsonify(thread)


@app.get('/api/seller-verifications/status')
def get_seller_verification_status():
    email = str(request.args.get('email') or '').strip().lower()
    if not email:
        return jsonify({'error': 'email is required.'}), 400

    applications = read_json(SELLER_VERIFICATIONS_FILE, {})
    if not isinstance(applications, dict):
        applications = {}
    application = applications.get(email)
    if not application:
        return jsonify({'status': None})

    return jsonify({
        'status': {
            'email': email,
            'status': application.get('status', 'pending'),
            'name': application.get('fullName', ''),
            'phone': application.get('phone', ''),
            'submittedAt': application.get('submittedAt', ''),
            'approvedAt': application.get('approvedAt', ''),
            'rejectedAt': application.get('rejectedAt', '')
        }
    })


@app.post('/api/seller-verifications')
def submit_seller_verification():
    payload = request.get_json(silent=True) or {}
    email = str(payload.get('email') or '').strip().lower()
    full_name = str(payload.get('fullName') or '').strip()
    phone = str(payload.get('phone') or '').strip()
    document_data = payload.get('documentData')
    document_type = str(payload.get('documentType') or '').strip().lower()
    allowed_document_types = {'application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'}
    if not email or '@' not in email or not full_name or not phone:
        return jsonify({'error': 'A valid email, full name, and phone number are required.'}), 400
    if (
        document_type not in allowed_document_types
        or not isinstance(document_data, str)
        or not document_data.startswith(f'data:{document_type};base64,')
        or len(document_data) > 7_200_000
    ):
        return jsonify({'error': 'A supporting document no larger than 5 MB is required.'}), 400

    applications = read_json(SELLER_VERIFICATIONS_FILE, {})
    if not isinstance(applications, dict):
        applications = {}
    existing = applications.get(email, {})
    if existing.get('status') == 'approved':
        return jsonify({'error': 'This account is already approved as a verified seller.'}), 409

    application = {
        'email': email,
        'fullName': full_name,
        'shopName': str(payload.get('shopName') or '').strip(),
        'phone': phone,
        'notes': str(payload.get('notes') or '').strip(),
        'documentName': str(payload.get('documentName') or 'Supporting document').strip(),
        'documentType': document_type,
        'documentData': document_data,
        'submittedAt': datetime.now(timezone.utc).isoformat(),
        'status': 'pending',
        'approvedAt': '',
        'rejectedAt': ''
    }
    applications[email] = application
    write_json(SELLER_VERIFICATIONS_FILE, applications)
    return jsonify({'status': {
        'email': email,
        'status': application['status'],
        'name': full_name,
        'phone': phone,
        'submittedAt': application['submittedAt']
    }}), 201


@app.get('/api/admin/seller-verifications')
def get_seller_verification_applications():
    authorization_error = require_admin_key()
    if authorization_error:
        return authorization_error
    applications = read_json(SELLER_VERIFICATIONS_FILE, {})
    if not isinstance(applications, dict):
        applications = {}
    return jsonify(list(applications.values()))


@app.patch('/api/admin/seller-verifications/<path:email>')
def update_seller_verification(email):
    authorization_error = require_admin_key()
    if authorization_error:
        return authorization_error
    normalized_email = email.strip().lower()
    payload = request.get_json(silent=True) or {}
    status = str(payload.get('status') or '').strip().lower()
    if status not in {'approved', 'rejected'}:
        return jsonify({'error': 'status must be approved or rejected.'}), 400

    applications = read_json(SELLER_VERIFICATIONS_FILE, {})
    if not isinstance(applications, dict):
        applications = {}
    application = applications.get(normalized_email)
    if not application:
        return jsonify({'error': 'Seller verification request was not found.'}), 404

    application['status'] = status
    application['approvedAt'] = datetime.now(timezone.utc).isoformat() if status == 'approved' else ''
    application['rejectedAt'] = datetime.now(timezone.utc).isoformat() if status == 'rejected' else ''
    applications[normalized_email] = application
    write_json(SELLER_VERIFICATIONS_FILE, applications)
    return jsonify({'status': {
        'email': normalized_email,
        'status': status,
        'name': application.get('fullName', ''),
        'phone': application.get('phone', ''),
        'submittedAt': application.get('submittedAt', ''),
        'approvedAt': application['approvedAt'],
        'rejectedAt': application['rejectedAt']
    }})


@app.route('/api/messages', methods=['GET', 'POST'])
def user_messages():
    account, error_response = require_account()
    if error_response:
        return error_response
    email = account['email']
    threads = read_json(MESSAGES_FILE, {})
    if not isinstance(threads, dict):
        threads = {}

    if request.method == 'GET':
        return jsonify(sorted(
            (thread for thread in threads.values() if email in thread.get('participants', [])),
            key=lambda thread: thread.get('lastUpdated', ''),
            reverse=True
        ))

    payload = request.get_json(silent=True) or {}
    text = str(payload.get('text') or '').strip()
    support = bool(payload.get('support'))
    recipient = str(payload.get('recipient') or '').strip().lower()
    if len(text) > 500:
        return jsonify({'error': 'A message of 1 to 500 characters is required.'}), 400
    if support:
        thread_id = f'support|{email}'
        participants = [email, 'support@rodyx.local']
    else:
        if not re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', recipient) or recipient == email:
            return jsonify({'error': 'A valid recipient email is required.'}), 400
        thread_id = '|'.join(sorted([email, recipient]))
        participants = [email, recipient]

    thread = threads.get(thread_id) or {
        'id': thread_id,
        'participants': participants,
        'names': {email: account.get('fullname', 'User'), participants[1]: 'CHUKA RODYX SHOP Support' if support else 'Community member'},
        'messages': [],
        'lastUpdated': datetime.now(timezone.utc).isoformat(),
        'support': support
    }
    if text:
        create_message(thread, email, text)
    threads[thread_id] = thread
    write_json(MESSAGES_FILE, threads)
    return jsonify(thread), 201


@app.get('/api/messages/unread')
def get_unread_message_count():
    account, error_response = require_account()
    if error_response:
        return error_response
    email = account['email']
    threads = read_json(MESSAGES_FILE, {})
    if not isinstance(threads, dict):
        threads = {}
    unread_count = sum(
        1
        for thread in threads.values()
        if email in thread.get('participants', [])
        for message in thread.get('messages', [])
        if message.get('sender') != email
        and email not in message.get('readBy', [])
    )
    return jsonify({'unread': unread_count})


@app.post('/api/messages/<path:thread_id>/read')
def mark_messages_read(thread_id):
    account, error_response = require_account()
    if error_response:
        return error_response
    threads = read_json(MESSAGES_FILE, {})
    thread = threads.get(thread_id) if isinstance(threads, dict) else None
    email = account['email']
    if not thread or email not in thread.get('participants', []):
        return jsonify({'error': 'Conversation was not found.'}), 404
    changed = False
    for message in thread.get('messages', []):
        if message.get('sender') == email:
            continue
        read_by = message.setdefault('readBy', [])
        if email not in read_by:
            read_by.append(email)
            changed = True
    if changed:
        threads[thread_id] = thread
        write_json(MESSAGES_FILE, threads)
    return jsonify(thread)


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=os.environ.get('FLASK_DEBUG') == '1')
