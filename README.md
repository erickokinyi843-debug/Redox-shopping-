# Redox Shopping

A student marketplace and local shopping web app designed for a static frontend with a Python backend.

## What was cleaned up

- Removed the fake demo product listings from the homepage and category pages.
- Removed the demo/admin wording that implied browser-only mock data was the real deployment state.
- Kept the project split so the frontend can be hosted on Vercel and the API can live on PythonAnywhere.

## Project layout

- Root folder: static frontend files for Vercel
- backend/: Flask API for listings, wanted posts, orders, and admin data
- config.js: frontend API base URL for the PythonAnywhere backend

## Backend deployment on PythonAnywhere

1. Create a new PythonAnywhere account and open the dashboard.
2. Open the Bash console and create a project folder, for example:
   - mkdir ~/redox-backend
   - cd ~/redox-backend
3. Upload the contents of the backend folder or clone the repo there.
4. Create a virtual environment:
   - mkvirtualenv --python=python3.12 redox-backend
   - pip install -r backend/requirements.txt
5. In the PythonAnywhere Web tab, create a new web app.
6. Choose "Manual configuration" and select the Python version you are using.
7. Set the source code path to your backend directory, for example:
   - /home/yourusername/redox-backend
8. Set the working directory to the same path.
9. In the WSGI file, point to the Flask app object:
   - from app import app
   - application = app
10. Save and reload the web app.
11. Test the API endpoint:
   - https://yourusername.pythonanywhere.com/api/health

## Frontend deployment on Vercel

1. Push the project to GitHub.
2. Open Vercel and import the repository.
3. Use the repository root as the project root.
4. In the Vercel project settings, deploy the static site as-is.
5. Open the root config.js file and replace the placeholder URL with your PythonAnywhere app URL:
   - window.APP_CONFIG = { apiBaseUrl: 'https://yourusername.pythonanywhere.com' };
6. Redeploy the Vercel project.
7. Your frontend will live on Vercel while the API runs on PythonAnywhere.

## Local development

- Frontend: open the HTML files directly or serve the folder with a simple local web server.
- Backend: run the Flask app locally from the backend folder:
  - cd backend
  - python app.py

## Notes

- The starter code intentionally does not keep fake products or demo listings in the storefront.
- The frontend uses the backend URL through config.js, so you can switch between local and production without editing multiple files.
- If you want full admin authentication and database storage, add PostgreSQL or SQLite with Flask and move the browser-only admin state to the server.
