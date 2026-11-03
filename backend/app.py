from __future__ import annotations

import json
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

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})


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
        'items': payload['items'],
        'total': payload.get('total', 0),
        'status': payload.get('status', 'Placed'),
        'fulfillmentMethod': payload.get('fulfillmentMethod', 'Pickup'),
        'createdAt': datetime.now(timezone.utc).isoformat(),
    }
    orders.insert(0, order)
    write_json(ORDERS_FILE, orders)
    return jsonify(order), 201


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
