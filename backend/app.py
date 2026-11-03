from __future__ import annotations

import json
import hmac
import os
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, jsonify, request
from flask_cors import CORS

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / 'data'
DATA_DIR.mkdir(exist_ok=True)

LISTINGS_FILE = DATA_DIR / 'listings.json'
WANTED_FILE = DATA_DIR / 'wanted.json'
ORDERS_FILE = DATA_DIR / 'orders.json'
SELLER_VERIFICATIONS_FILE = DATA_DIR / 'seller_verifications.json'

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


@app.get('/api/health')
def health():
    return jsonify({
        'status': 'ok',
        'message': 'Marketplace API is online.',
        'timestamp': datetime.now(timezone.utc).isoformat()
    })


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
        return jsonify({'error': 'Seller verification administration is not configured on the server.'}), 503
    supplied_key = request.headers.get('X-Admin-Key', '')
    if not hmac.compare_digest(supplied_key.encode('utf-8'), configured_key.encode('utf-8')):
        return jsonify({'error': 'A valid admin API key is required.'}), 401
    return None


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


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=os.environ.get('FLASK_DEBUG') == '1')
