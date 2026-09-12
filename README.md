# FitTrackr

Free full-featured nutrition & fitness tracker. Everything MyFitnessPal charges $79–99/year for, at no cost.

## Deploy to Netlify (5 minutes)

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "FitTrackr initial commit"
# Create a new repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/fittrackr.git
git push -u origin main
```

### 2. Connect to Netlify
1. Go to [app.netlify.com](https://app.netlify.com)
2. Click **Add new site → Import an existing project**
3. Connect GitHub and select your `fittrackr` repo
4. Build settings are auto-detected from `netlify.toml`:
   - Build command: `npm run build`
   - Publish directory: `dist`

### 3. Add your Anthropic API key
1. In Netlify: **Site Settings → Environment Variables → Add variable**
2. Key: `ANTHROPIC_API_KEY`
3. Value: your key from [console.anthropic.com](https://console.anthropic.com)
4. Click **Deploy site**

That's it. Your FitTrackr is live at `https://YOUR-SITE.netlify.app`.

---

## Run locally
```bash
npm install
npm run dev
```
Then open http://localhost:5173

For local AI features, create `.env`:
```
ANTHROPIC_API_KEY=sk-ant-...
```

## Features vs MyFitnessPal

| Feature | MFP Price | FitTrackr |
|---|---|---|
| Barcode scanner | $79.99/yr | Free |
| Custom macros by gram | $79.99/yr | Free |
| Net carbs tracking | $79.99/yr | Free |
| Weekly nutrition reports | $79.99/yr | Free |
| AI meal photo scan | $79.99/yr | Free |
| Recipe builder | $79.99/yr | Free |
| AI Meal Plan Builder | $99.99/yr | Free |
| No entry cap | $79.99/yr | Free |
| No ads | $79.99/yr | Free |
