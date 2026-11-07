import json
import hashlib
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import app as marketplace


class AdminFeaturesTestCase(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        data_dir = Path(self.temp_dir.name)
        marketplace.ACCOUNTS_FILE = data_dir / 'accounts.json'
        marketplace.AUTH_SESSIONS_FILE = data_dir / 'auth_sessions.json'
        marketplace.MESSAGES_FILE = data_dir / 'messages.json'
        marketplace.SELLER_VERIFICATIONS_FILE = data_dir / 'seller_verifications.json'
        marketplace.LISTINGS_FILE = data_dir / 'listings.json'
        marketplace.CONTENT_FILES = {
            **marketplace.CONTENT_FILES,
            'services': data_dir / 'services.json'
        }
        self.admin_key = patch.dict(os.environ, {'ADMIN_API_KEY': 'test-admin-key'})
        self.admin_key.start()
        self.client = marketplace.app.test_client()

    def tearDown(self):
        self.admin_key.stop()
        self.temp_dir.cleanup()

    def admin_headers(self):
        return {'X-Admin-Key': 'test-admin-key'}

    def create_account(self, email='shopper@example.com'):
        response = self.client.post('/api/auth/register', json={
            'fullname': 'Marketplace Shopper',
            'email': email,
            'phone': '0700000000',
            'password': 'password-123'
        })
        self.assertEqual(response.status_code, 201)
        return response.get_json()

    def test_account_admin_routes_require_key_and_hide_credentials(self):
        self.create_account()
        unauthorized = self.client.get('/api/admin/accounts')
        self.assertEqual(unauthorized.status_code, 401)

        response = self.client.get('/api/admin/accounts', headers=self.admin_headers())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()[0]['email'], 'shopper@example.com')
        self.assertNotIn('passwordHash', response.get_data(as_text=True))
        self.assertNotIn('salt', response.get_data(as_text=True))

    def test_suspend_revokes_session_and_prevents_login(self):
        result = self.create_account()
        token = result['token']
        response = self.client.patch(
            '/api/admin/accounts/shopper%40example.com',
            headers=self.admin_headers(),
            json={'status': 'suspended'}
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()['account']['status'], 'suspended')
        self.assertEqual(self.client.get('/api/messages', headers={'Authorization': f'Bearer {token}'}).status_code, 401)
        self.assertEqual(self.client.post('/api/auth/login', json={
            'email': 'shopper@example.com',
            'password': 'password-123'
        }).status_code, 403)

    def test_legacy_import_cannot_replace_existing_shared_account(self):
        self.create_account()
        response = self.client.post('/api/auth/import', json={
            'fullname': 'Attacker',
            'email': 'shopper@example.com',
            'salt': '00' * 16,
            'passwordHash': hashlib.pbkdf2_hmac('sha256', b'guess', bytes(16), 120000).hex(),
            'password': 'guess'
        })
        self.assertEqual(response.status_code, 409)

    def test_admin_can_publish_product_and_service(self):
        product = self.client.post('/api/admin/listings', headers=self.admin_headers(), json={
            'title': 'Featured item',
            'price': 1200,
            'category': 'Home',
            'description': 'A featured marketplace item'
        })
        self.assertEqual(product.status_code, 201)
        self.assertEqual(self.client.get('/api/listings').get_json()[0]['title'], 'Featured item')

        service = self.client.post('/api/admin/content/services', headers=self.admin_headers(), json={
            'title': 'Admin featured service',
            'description': 'Available to the community',
            'skill': 'Tutoring',
            'providerName': 'CHUKA RODYX SHOP',
            'email': 'support@example.com'
        })
        self.assertEqual(service.status_code, 201)
        self.assertEqual(self.client.get('/api/content/services').get_json()[0]['title'], 'Admin featured service')

    def test_support_conversation_is_shared_between_user_and_admin(self):
        result = self.create_account()
        user_headers = {'Authorization': f"Bearer {result['token']}"}
        message = self.client.post('/api/messages', headers=user_headers, json={
            'support': True,
            'text': 'I need help with my account'
        })
        self.assertEqual(message.status_code, 201)
        thread_id = message.get_json()['id']

        inbox = self.client.get('/api/admin/support', headers=self.admin_headers())
        self.assertEqual(inbox.status_code, 200)
        self.assertEqual(inbox.get_json()[0]['id'], thread_id)

        reply = self.client.post(
            f'/api/admin/support/{thread_id}/messages',
            headers=self.admin_headers(),
            json={'text': 'We can help with that.'}
        )
        self.assertEqual(reply.status_code, 200)
        user_threads = self.client.get('/api/messages', headers=user_headers).get_json()
        self.assertEqual(user_threads[0]['messages'][-1]['sender'], 'support@rodyx.local')
        self.assertEqual(user_threads[0]['messages'][-1]['text'], 'We can help with that.')
        unread = self.client.get('/api/messages/unread', headers=user_headers)
        self.assertEqual(unread.get_json()['unread'], 1)
        self.client.post(f'/api/messages/{thread_id}/read', headers=user_headers)
        self.assertEqual(self.client.get('/api/messages/unread', headers=user_headers).get_json()['unread'], 0)

    def test_user_listing_route_remains_available_to_sellers(self):
        response = self.client.post('/api/listings', json={
            'title': 'Seller item',
            'price': 500,
            'category': 'Books',
            'description': 'A seller-created listing',
            'sellerEmail': 'seller@example.com'
        })
        self.assertEqual(response.status_code, 201)
        self.assertEqual(json.loads(response.get_data(as_text=True))['sellerEmail'], 'seller@example.com')


if __name__ == '__main__':
    unittest.main()
