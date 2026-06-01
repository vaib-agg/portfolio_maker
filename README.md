# nyave.in

Grant / credibility site for **Nyave** (Yogkshem Technology Private Limited).

Plain static site — HTML + one shared stylesheet + design tokens + a small vanilla JS file. No build step. Deployed on Render (auto-deploy on push to `main`).

The build-progress tracker (hero quick view + the detailed "Where we stand" timeline) reads a single curated public file, `progress.json`. Both views read that one file, so they can never disagree; if it is absent or fails to load, the hardcoded values in the markup stand.
