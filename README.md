# Redox Shopping

Redox Shopping is a static HTML/CSS/JavaScript marketplace with a Flask API. The frontend can be deployed from this repository on Vercel, with the Flask API hosted separately on PythonAnywhere.

## What is shared by the API

The Flask API stores marketplace listings, wanted posts, orders, seller verification requests, registered accounts, and support conversations as JSON files under `backend/data/`. Account registration and sign-in use the shared API; older browser-only accounts are imported the next time their owner signs in. Signed-in users can chat with sellers and support across devices.

The admin page uses the server `ADMIN_API_KEY` to review seller verification requests, view and suspend or delete accounts, publish products and services, and reply to user support chats. Sellers can continue publishing listings and services through the marketplace. Accommodation, rentals, and events still use the current browser's `localStorage` and are not shared across devices. Listing images and seller verification documents can be up to 5 MB; they are sent as base64 data, so the API allows an 8 MB request body to accommodate the encoding overhead.

The JSON-file storage and bearer sessions are a small-project starting point, not a production identity system or database. Back up `backend/data/`; use a database and hardened server-side authentication before handling real accounts, sensitive data, payments, or high traffic.

## Deploy the backend to PythonAnywhere

1. Create a PythonAnywhere account and open its **Consoles → Bash** console.
2. Put this repository on PythonAnywhere. If it is public, you can clone it:

   ```bash
   cd ~
   git clone https://github.com/erickokinyi843-debug/Redox-shopping-.git
   ```

   If the repository is private or you do not want to clone it, upload the contents of the `backend/` folder with the PythonAnywhere **Files** page. The examples below assume the repository is at `/home/yourusername/Redox-shopping-`.
3. Create and activate a virtual environment using a Python version offered for your PythonAnywhere web app:

   ```bash
   mkvirtualenv --python=python3.12 redox-backend
   cd ~/Redox-shopping-/backend
   pip install -r requirements.txt
   ```

   If Python 3.12 is not available on your account, use another offered version consistently for both the virtual environment and web app.
4. In **Web → Add a new web app**, choose your Python version and **Manual configuration**. Do not select a Django framework.
5. In the web app configuration:
   - Set **Source code** and **Working directory** to `/home/yourusername/Redox-shopping-/backend`.
   - Set **Virtualenv** to `/home/yourusername/.virtualenvs/redox-backend`.
6. Open the WSGI configuration file linked from the Web tab. Replace its contents with the following, changing `yourusername`:

   ```python
   import os
   import sys

   project_home = "/home/yourusername/Redox-shopping-/backend"
   if project_home not in sys.path:
       sys.path.insert(0, project_home)

   # Replace this with your Vercel origin after the frontend is deployed.
   os.environ["CORS_ORIGINS"] = "https://your-project.vercel.app"

   # Generate a unique secret in the PythonAnywhere console and keep it out of Git.
   os.environ["ADMIN_API_KEY"] = "replace-with-a-long-random-secret"

   from app import app as application
   ```

   Generate the secret with `python -c "import secrets; print(secrets.token_urlsafe(32))"` and replace the example value. Do not commit the real key or enter it in frontend files. The origin must be the exact website origin, with no trailing slash. For a custom domain, list both domains separated by a comma, for example `"https://your-project.vercel.app,https://shop.example.com"`.
7. Click **Reload** in the PythonAnywhere Web tab. Open `https://yourusername.pythonanywhere.com/api/health`; a JSON response with `"status": "ok"` confirms the API is running.

## Deploy the frontend to Vercel

1. Push this repository to GitHub.
2. In Vercel, choose **Add New → Project** and import this repository.
3. Set **Root Directory** to `frontend` and select **Other** as the framework preset. This keeps `backend/` and its data files outside the frontend deployment.
4. This is a static site: leave the build command empty and set the output directory to `.` if Vercel requires a value.
5. Deploy once, then copy the Vercel production URL, such as `https://your-project.vercel.app`.
6. In PythonAnywhere, update `CORS_ORIGINS` in the WSGI file to that exact Vercel origin and click **Reload**.
7. In the frontend's [config.js](./frontend/config.js), set `apiBaseUrl` to the PythonAnywhere API origin, with no trailing slash:

   ```js
   window.APP_CONFIG = {
     apiBaseUrl: 'https://yourusername.pythonanywhere.com'
   };
   ```

8. Commit and push that change to GitHub. Vercel will redeploy automatically. If it does not, choose **Deployments → Redeploy**.
9. Open the Vercel site and test:
   - `Buy & Sell`: load listings.
   - `Sell an item`: post a listing, then confirm it appears on another browser/device.
   - `Wanted`: create and view a post.
   - Add an item to the cart and submit an order. Orders are recorded by the API, but the site does not process payments.
   - Submit a seller verification request. On the admin page, enter the server `ADMIN_API_KEY` and connect. Approval or rejection is saved by the API; the seller status page refreshes automatically.
   - Create a user account, then use the admin page to view, suspend, or delete it. Try publishing a product and service, and send a help message from the user dashboard to test the admin support inbox.

If seller verification fails, first open the PythonAnywhere `/api/health` URL. A working health route alongside a 404 for `/api/admin/seller-verifications` means the deployed web app is running older backend code. After publishing the update, run `cd ~/Redox-shopping- && git pull` in the PythonAnywhere Bash console (or upload the updated `backend/app.py` if the project was uploaded manually), then click **Reload** in the PythonAnywhere Web tab. If the admin page reports that its request was blocked but health succeeds, deploy/reload the current backend and confirm `CORS_ORIGINS` includes the exact frontend origin (including any custom domain). Also check that the frontend's `config.js` has the correct API URL and `ADMIN_API_KEY` is set for verification administration. The PythonAnywhere **Error log** is available from the Web tab.

## Local development

1. Install the backend requirements in a Python virtual environment:

   ```bash
   cd backend
   pip install -r requirements.txt
   python app.py
   ```

2. Set `apiBaseUrl` in `frontend/config.js` to `http://localhost:5000`.
3. Serve the `frontend/` directory over HTTP (for example with the VS Code Live Server extension), then open the local site. The API allows common localhost development origins by default.

Do not enable Flask debug mode on PythonAnywhere. The API only enables it locally when `FLASK_DEBUG=1` is explicitly set.
