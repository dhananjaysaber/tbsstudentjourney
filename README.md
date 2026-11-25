# TBS Student Journey Portfolio

Deployed build (v34) of the student portfolio, served from `dist/` (Netlify). Shares the Supabase database with the Panthers app.

Note: this repo holds the compiled build only; the original source project is not included.

v34 changes:
- Award card footer word now shows the sport name.
- Journey section display (Carousel / Spiral / Blog) is set by Admin/SuperAdmin: school default plus optional per-student override. Viewers see no switch buttons.
- Needs the Supabase table `portfolio_display_settings` and RPCs `portfolio_can_set_display`, `portfolio_get_display_mode`, `portfolio_set_display_mode`.
