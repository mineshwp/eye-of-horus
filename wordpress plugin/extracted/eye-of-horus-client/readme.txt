=== Eye of Horus Client ===
Contributors: eyeofhorus
Tags: monitoring, reporting, client, dashboard
Requires at least: 6.0
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 2.4.4
License: GPLv2 or later

Technical monitoring and reporting agent for the Eye of Horus Dashboard.

== Description ==

Eye of Horus Client sends key WordPress website data to your Eye of Horus Dashboard, including:

* WordPress version
* PHP version
* Site URL and home URL
* Active theme and theme version
* Installed plugins
* Active plugins
* Available plugin update count
* Daily tracked form submissions

It includes a daily scheduled sync and a manual sync button inside the WordPress admin area.

== Installation ==

1. Upload the `eye-of-horus-client` folder to `/wp-content/plugins/` or install the ZIP from Plugins > Add New > Upload Plugin.
2. Activate the plugin.
3. Go to Eye of Horus in the WordPress admin menu.
4. Add the API Endpoint and Site Secret Key.
5. Click Save Changes.
6. Use Force Sync Now to test the connection.

== A-Forms submission tracking ==

The plugin currently listens for this hook:

`a_forms_after_form_submission`

If your A-Forms plugin uses a different submission hook, edit the hook in `eye-of-horus-client.php` and point it to `track_form_submission()`.

== Changelog ==

= 1.0.0 =
* Initial release.
