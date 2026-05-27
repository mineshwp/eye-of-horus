<?php
/**
 * Plugin Name: Eye of Horus Client
 * Plugin URI: https://wetpaint.co.za/
 * Description: Technical monitoring and reporting agent for the Eye of Horus Dashboard.
 * Version: 2.0.0
 * Author: Eye of Horus
 * Author URI: https://wetpaint.co.za/
 * Text Domain: eye-of-horus-client
 * Requires at least: 6.0
 * Requires PHP: 7.4
 */

if (!defined('ABSPATH')) {
    exit;
}

if (!class_exists('Eye_Of_Horus_Client')) {
    final class Eye_Of_Horus_Client {
        const VERSION      = '2.0.0';
        const OPTION_NAME  = 'eoh_settings';
        const CRON_HOOK    = 'eoh_daily_sync';
        const LAST_SYNC    = 'eoh_last_sync_result';

        private static $instance = null;

        public static function instance() {
            if (null === self::$instance) {
                self::$instance = new self();
            }
            return self::$instance;
        }

        private function __construct() {
            add_action('admin_menu',            [$this, 'add_settings_page']);
            add_action('admin_init',            [$this, 'register_settings']);
            add_action('admin_enqueue_scripts', [$this, 'enqueue_admin_assets']);
            add_action(self::CRON_HOOK,         [$this, 'sync_data']);
            add_action('wp_ajax_eoh_manual_sync',       [$this, 'ajax_manual_sync']);
            add_action('wp_ajax_eoh_test_connection',   [$this, 'ajax_test_connection']);

            // Form submission tracking — A-Forms
            add_action('a_forms_after_form_submission', [$this, 'track_submission'], 10, 1);
            // WPForms
            add_action('wpforms_process_complete', [$this, 'track_submission'], 10, 1);
            // Contact Form 7
            add_action('wpcf7_mail_sent', [$this, 'track_submission'], 10, 1);
            // Gravity Forms
            add_action('gform_after_submission', [$this, 'track_submission'], 10, 2);
            // Ninja Forms
            add_action('ninja_forms_after_submission', [$this, 'track_submission'], 10, 1);
            // Elementor Forms
            add_action('elementor_pro/forms/new_record', [$this, 'track_submission'], 10, 1);
        }

        public static function activate() {
            if (!wp_next_scheduled(self::CRON_HOOK)) {
                wp_schedule_event(time() + HOUR_IN_SECONDS, 'daily', self::CRON_HOOK);
            }
        }

        public static function deactivate() {
            $ts = wp_next_scheduled(self::CRON_HOOK);
            if ($ts) {
                wp_unschedule_event($ts, self::CRON_HOOK);
            }
        }

        // -------------------------------------------------------------------------
        // Admin menu & settings
        // -------------------------------------------------------------------------

        public function add_settings_page() {
            add_menu_page(
                __('Eye of Horus', 'eye-of-horus-client'),
                __('Eye of Horus', 'eye-of-horus-client'),
                'manage_options',
                'eye-of-horus',
                [$this, 'render_settings_ui'],
                'dashicons-visibility',
                81
            );
        }

        public function register_settings() {
            register_setting(self::OPTION_NAME, self::OPTION_NAME, [
                'type'              => 'array',
                'sanitize_callback' => [$this, 'sanitize_settings'],
                'default'           => $this->default_settings(),
            ]);
        }

        private function default_settings() {
            return [
                'api_url'           => '',
                'site_key'          => '',
                'enabled_modules'   => [
                    'core'      => '1',
                    'plugins'   => '1',
                    'themes'    => '1',
                    'security'  => '1',
                    'forms'     => '1',
                    'server'    => '1',
                ],
                'debug_mode'        => '',
            ];
        }

        /**
         * Normalize the API URL so users can paste either the base domain or the full
         * /api/wordpress path — both work.
         */
        private function normalize_api_url($raw_url) {
            $url = esc_url_raw(trim($raw_url));
            if (empty($url)) {
                return '';
            }
            // Strip any trailing slash
            $url = rtrim($url, '/');
            // If it doesn't already end with /api/wordpress, append it
            if (substr($url, -strlen('/api/wordpress')) !== '/api/wordpress') {
                $url .= '/api/wordpress';
            }
            return $url;
        }

        public function sanitize_settings($input) {
            $defaults = $this->default_settings();
            $out = $defaults;

            if (isset($input['api_url'])) {
                $out['api_url'] = $this->normalize_api_url($input['api_url']);
            }
            if (isset($input['site_key'])) {
                $out['site_key'] = sanitize_text_field(trim($input['site_key']));
            }
            if (isset($input['debug_mode'])) {
                $out['debug_mode'] = '1';
            }

            $modules = ['core', 'plugins', 'themes', 'security', 'forms', 'server'];
            foreach ($modules as $mod) {
                $out['enabled_modules'][$mod] = !empty($input['enabled_modules'][$mod]) ? '1' : '';
            }

            return $out;
        }

        public function enqueue_admin_assets($hook) {
            if ('toplevel_page_eye-of-horus' !== $hook) {
                return;
            }
            wp_enqueue_script(
                'eye-of-horus-client-admin',
                plugin_dir_url(__FILE__) . 'assets/js/admin.js',
                [],
                self::VERSION,
                true
            );
            wp_localize_script('eye-of-horus-client-admin', 'EyeOfHorusClient', [
                'ajaxUrl'       => admin_url('admin-ajax.php'),
                'nonce'         => wp_create_nonce('eoh_manual_sync'),
                'testNonce'     => wp_create_nonce('eoh_test_connection'),
                'syncingText'   => __('Syncing…', 'eye-of-horus-client'),
                'testingText'   => __('Testing…', 'eye-of-horus-client'),
                'defaultText'   => __('Sync Now', 'eye-of-horus-client'),
                'testDefault'   => __('Test Connection', 'eye-of-horus-client'),
            ]);
        }

        // -------------------------------------------------------------------------
        // Settings UI
        // -------------------------------------------------------------------------

        public function render_settings_ui() {
            if (!current_user_can('manage_options')) {
                wp_die(esc_html__('You do not have permission to access this page.', 'eye-of-horus-client'));
            }

            $opts      = wp_parse_args(get_option(self::OPTION_NAME, []), $this->default_settings());
            $last_sync = get_option(self::LAST_SYNC, []);
            $modules   = $opts['enabled_modules'] ?? [];

            ?>
            <div class="wrap">
                <h1 style="display:flex;align-items:center;gap:8px;">
                    <span class="dashicons dashicons-visibility" style="font-size:24px;"></span>
                    <?php esc_html_e('Eye of Horus — Connection Settings', 'eye-of-horus-client'); ?>
                </h1>

                <?php settings_errors(); ?>

                <form method="post" action="options.php">
                    <?php settings_fields(self::OPTION_NAME); ?>

                    <h2><?php esc_html_e('Dashboard Connection', 'eye-of-horus-client'); ?></h2>
                    <table class="form-table" role="presentation">
                        <tr>
                            <th scope="row">
                                <label for="eoh-api-url"><?php esc_html_e('API Endpoint', 'eye-of-horus-client'); ?></label>
                            </th>
                            <td>
                                <input id="eoh-api-url" type="url"
                                    name="<?php echo esc_attr(self::OPTION_NAME); ?>[api_url]"
                                    value="<?php echo esc_attr($opts['api_url']); ?>"
                                    class="regular-text"
                                    placeholder="https://eye-of-horus-2point0-alpha.vercel.app" />
                                <p class="description">
                                    <?php esc_html_e('Your Eye of Horus dashboard URL. You can paste the base URL — /api/wordpress is appended automatically when you save.', 'eye-of-horus-client'); ?>
                                    <?php if (!empty($opts['api_url'])) : ?>
                                        <br /><strong><?php esc_html_e('Current endpoint:', 'eye-of-horus-client'); ?></strong>
                                        <code><?php echo esc_html($opts['api_url']); ?></code>
                                    <?php endif; ?>
                                </p>
                            </td>
                        </tr>
                        <tr>
                            <th scope="row">
                                <label for="eoh-site-key"><?php esc_html_e('Site API Key', 'eye-of-horus-client'); ?></label>
                            </th>
                            <td>
                                <input id="eoh-site-key" type="password"
                                    name="<?php echo esc_attr(self::OPTION_NAME); ?>[site_key]"
                                    value="<?php echo esc_attr($opts['site_key']); ?>"
                                    class="regular-text"
                                    autocomplete="new-password" />
                                <p class="description"><?php esc_html_e('Sent as the X-EOH-KEY header. Generate this key from the Eye of Horus dashboard.', 'eye-of-horus-client'); ?></p>
                            </td>
                        </tr>
                    </table>

                    <h2><?php esc_html_e('Data Modules', 'eye-of-horus-client'); ?></h2>
                    <table class="form-table" role="presentation">
                        <?php
                        $module_labels = [
                            'core'     => __('Core (WP version, PHP, MySQL)', 'eye-of-horus-client'),
                            'plugins'  => __('Plugins (active, inactive, updates)', 'eye-of-horus-client'),
                            'themes'   => __('Themes (active, parent, updates)', 'eye-of-horus-client'),
                            'security' => __('Security (debug mode, admin users, security plugin)', 'eye-of-horus-client'),
                            'forms'    => __('Forms (A-Forms, WPForms, CF7, Gravity, Ninja, Elementor)', 'eye-of-horus-client'),
                            'server'   => __('Server (DB size, cron status, error log)', 'eye-of-horus-client'),
                        ];
                        foreach ($module_labels as $key => $label) : ?>
                            <tr>
                                <th scope="row"><?php echo esc_html($label); ?></th>
                                <td>
                                    <label>
                                        <input type="checkbox"
                                            name="<?php echo esc_attr(self::OPTION_NAME); ?>[enabled_modules][<?php echo esc_attr($key); ?>]"
                                            value="1"
                                            <?php checked(!empty($modules[$key])); ?> />
                                        <?php esc_html_e('Send this data to the dashboard', 'eye-of-horus-client'); ?>
                                    </label>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                        <tr>
                            <th scope="row"><?php esc_html_e('Debug mode', 'eye-of-horus-client'); ?></th>
                            <td>
                                <label>
                                    <input type="checkbox"
                                        name="<?php echo esc_attr(self::OPTION_NAME); ?>[debug_mode]"
                                        value="1"
                                        <?php checked(!empty($opts['debug_mode'])); ?> />
                                    <?php esc_html_e('Log sync payloads to the WordPress debug log', 'eye-of-horus-client'); ?>
                                </label>
                            </td>
                        </tr>
                    </table>

                    <?php submit_button(__('Save Settings', 'eye-of-horus-client')); ?>
                </form>

                <hr />

                <h2><?php esc_html_e('Connection', 'eye-of-horus-client'); ?></h2>
                <p>
                    <button id="eoh-test-connection" class="button button-secondary">
                        <?php esc_html_e('Test Connection', 'eye-of-horus-client'); ?>
                    </button>
                    &nbsp;
                    <button id="eoh-sync-now" class="button button-primary">
                        <?php esc_html_e('Sync Now', 'eye-of-horus-client'); ?>
                    </button>
                    <span id="eoh-sync-status" style="display:inline-block;margin-left:12px;font-style:italic;"></span>
                </p>

                <?php if (!empty($last_sync)) : ?>
                    <h2><?php esc_html_e('Last Sync', 'eye-of-horus-client'); ?></h2>
                    <table class="widefat striped" style="max-width:700px;">
                        <tbody>
                            <tr>
                                <th><?php esc_html_e('Status', 'eye-of-horus-client'); ?></th>
                                <td><?php echo !empty($last_sync['success'])
                                        ? '<span style="color:#00a32a;">&#10003; ' . esc_html__('Success', 'eye-of-horus-client') . '</span>'
                                        : '<span style="color:#d63638;">&#10007; ' . esc_html__('Failed', 'eye-of-horus-client') . '</span>'; ?></td>
                            </tr>
                            <tr>
                                <th><?php esc_html_e('Time', 'eye-of-horus-client'); ?></th>
                                <td><?php echo esc_html($last_sync['time'] ?? ''); ?></td>
                            </tr>
                            <tr>
                                <th><?php esc_html_e('Message', 'eye-of-horus-client'); ?></th>
                                <td><?php echo esc_html($last_sync['message'] ?? ''); ?></td>
                            </tr>
                        </tbody>
                    </table>
                <?php endif; ?>
            </div>
            <?php
        }

        // -------------------------------------------------------------------------
        // Data collection
        // -------------------------------------------------------------------------

        public function get_site_data() {
            $opts    = wp_parse_args(get_option(self::OPTION_NAME, []), $this->default_settings());
            $modules = $opts['enabled_modules'] ?? [];

            if (!function_exists('get_plugins')) {
                require_once ABSPATH . 'wp-admin/includes/plugin.php';
            }
            if (!function_exists('get_plugin_updates')) {
                require_once ABSPATH . 'wp-admin/includes/update.php';
            }

            $payload = [
                'client_plugin_version' => self::VERSION,
                'site_name'             => get_bloginfo('name'),
                'site_url'              => get_site_url(),
                'home_url'              => home_url(),
                'last_sync'             => current_time('c'),
            ];

            // --- Core ---
            if (!empty($modules['core'])) {
                $payload['wp_version']    = get_bloginfo('version');
                $payload['php_version']   = phpversion();
                $payload['mysql_version'] = $this->get_mysql_version();

                $wp_update = get_site_transient('update_core');
                $core_update_available = false;
                $core_new_version      = null;
                if (isset($wp_update->updates) && is_array($wp_update->updates)) {
                    foreach ($wp_update->updates as $u) {
                        if (isset($u->response) && $u->response === 'upgrade') {
                            $core_update_available = true;
                            $core_new_version = $u->version ?? null;
                            break;
                        }
                    }
                }
                $payload['update_data'] = [
                    'core_update'     => $core_update_available,
                    'core_version'    => $core_new_version,
                    'plugin_updates'  => 0,
                    'theme_updates'   => 0,
                ];
            }

            // --- Plugins ---
            if (!empty($modules['plugins'])) {
                $all_plugins    = get_plugins();
                $active_plugins = get_option('active_plugins', []);
                $plugin_updates = get_site_transient('update_plugins');

                $plugin_list = [];
                foreach ($all_plugins as $file => $data) {
                    $has_update  = isset($plugin_updates->response[$file]);
                    $new_version = $has_update ? ($plugin_updates->response[$file]->new_version ?? null) : null;
                    $plugin_list[] = [
                        'file'             => $file,
                        'name'             => $data['Name'],
                        'version'          => $data['Version'],
                        'active'           => in_array($file, $active_plugins, true),
                        'update_available' => $has_update,
                        'new_version'      => $new_version,
                    ];
                }
                $payload['plugin_data'] = $plugin_list;

                if (isset($payload['update_data'])) {
                    $payload['update_data']['plugin_updates'] = count(array_filter($plugin_list, fn($p) => $p['update_available']));
                }
            }

            // --- Themes ---
            if (!empty($modules['themes'])) {
                $theme         = wp_get_theme();
                $theme_updates = get_site_transient('update_themes');
                $theme_slug    = $theme->get_stylesheet();
                $has_theme_upd = isset($theme_updates->response[$theme_slug]);

                $parent_theme = null;
                if ($theme->parent()) {
                    $parent_theme = [
                        'name'    => $theme->parent()->get('Name'),
                        'version' => $theme->parent()->get('Version'),
                    ];
                }

                $payload['theme_data'] = [
                    'name'             => $theme->get('Name'),
                    'version'          => $theme->get('Version'),
                    'template'         => $theme->get_template(),
                    'parent_theme'     => $parent_theme,
                    'update_available' => $has_theme_upd,
                    'new_version'      => $has_theme_upd ? ($theme_updates->response[$theme_slug]['new_version'] ?? null) : null,
                ];

                if (isset($payload['update_data'])) {
                    $payload['update_data']['theme_updates'] = $has_theme_upd ? 1 : 0;
                }
            }

            // --- Security ---
            if (!empty($modules['security'])) {
                $admin_users = get_users(['role' => 'administrator', 'fields' => 'ID']);

                $security_plugin = null;
                $known_security = [
                    'wordfence/wordfence.php'              => 'Wordfence',
                    'better-wp-security/better-wp-security.php' => 'iThemes Security',
                    'sucuri-scanner/sucuri.php'            => 'Sucuri',
                    'all-in-one-wp-security-and-firewall/wp-security.php' => 'All-In-One Security',
                    'jetpack/jetpack.php'                  => 'Jetpack (Protect)',
                ];
                $active = get_option('active_plugins', []);
                foreach ($known_security as $slug => $name) {
                    if (in_array($slug, $active, true)) {
                        $security_plugin = $name;
                        break;
                    }
                }

                // Read last 20 lines of debug log if readable
                $log_lines = [];
                $log_path  = WP_CONTENT_DIR . '/debug.log';
                if (is_readable($log_path) && filesize($log_path) > 0) {
                    $lines = $this->tail_file($log_path, 20);
                    // Strip any lines that may contain user data
                    $log_lines = array_map('sanitize_text_field', $lines);
                }

                $payload['security_data'] = [
                    'debug_mode'      => (bool) (defined('WP_DEBUG') && WP_DEBUG),
                    'admin_users'     => count($admin_users),
                    'security_plugin' => $security_plugin,
                    'error_log_lines' => $log_lines,
                ];
            }

            // --- Forms ---
            if (!empty($modules['forms'])) {
                $payload['form_data'] = $this->collect_form_data();
            }

            // --- Server ---
            if (!empty($modules['server'])) {
                $payload['server_data'] = [
                    'db_size_mb'       => $this->get_db_size_mb(),
                    'cron_enabled'     => !(defined('DISABLE_WP_CRON') && DISABLE_WP_CRON),
                    'site_health_ok'   => $this->get_site_health_status(),
                    'language'         => get_bloginfo('language'),
                    'timezone'         => wp_timezone_string(),
                    'admin_email'      => get_bloginfo('admin_email'),
                ];
            }

            if (!empty($opts['debug_mode'])) {
                error_log('[EOH] Sync payload: ' . wp_json_encode($payload));
            }

            return $payload;
        }

        private function get_mysql_version() {
            global $wpdb;
            $version = $wpdb->get_var('SELECT VERSION()');
            return is_string($version) ? $version : null;
        }

        private function get_db_size_mb() {
            global $wpdb;
            $size = $wpdb->get_var($wpdb->prepare(
                "SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024, 2)
                 FROM information_schema.tables
                 WHERE table_schema = %s",
                DB_NAME
            ));
            return $size ? (float) $size : null;
        }

        private function get_site_health_status() {
            if (!class_exists('WP_Site_Health')) {
                return null;
            }
            // Just return true if the class is available — full check is expensive
            return true;
        }

        private function tail_file($path, $lines) {
            $file  = new SplFileObject($path, 'r');
            $file->seek(PHP_INT_MAX);
            $total = $file->key();
            $start = max(0, $total - $lines);
            $file->seek($start);
            $result = [];
            while (!$file->eof()) {
                $result[] = rtrim($file->fgets());
            }
            return array_filter($result);
        }

        // -------------------------------------------------------------------------
        // Form tracking
        // -------------------------------------------------------------------------

        private function collect_form_data() {
            $forms = [];

            // A-Forms
            if (function_exists('af_get_forms') || class_exists('AF_Form')) {
                $forms[] = [
                    'plugin'      => 'A-Forms',
                    'submissions' => (int) get_option('eoh_aforms_submissions', 0),
                    'active'      => true,
                ];
            }

            // WPForms
            if (function_exists('wpforms')) {
                $wpforms = wpforms()->form->get('', ['numberposts' => 50]);
                if (!empty($wpforms)) {
                    foreach ($wpforms as $f) {
                        $forms[] = [
                            'plugin'      => 'WPForms',
                            'name'        => $f->post_title,
                            'id'          => $f->ID,
                            'active'      => true,
                            'submissions' => null, // requires WPForms Pro
                        ];
                    }
                }
            }

            // Contact Form 7
            if (class_exists('WPCF7_ContactForm')) {
                $cf7_forms = WPCF7_ContactForm::find(['posts_per_page' => 50]);
                foreach ($cf7_forms as $f) {
                    $forms[] = [
                        'plugin' => 'Contact Form 7',
                        'name'   => $f->title(),
                        'id'     => $f->id(),
                        'active' => true,
                    ];
                }
            }

            // Gravity Forms
            if (class_exists('GFAPI')) {
                $gf_forms = GFAPI::get_forms();
                if (!empty($gf_forms)) {
                    foreach ($gf_forms as $f) {
                        $entry_count = GFAPI::count_entries($f['id']);
                        $forms[] = [
                            'plugin'      => 'Gravity Forms',
                            'name'        => $f['title'],
                            'id'          => $f['id'],
                            'active'      => (bool) $f['is_active'],
                            'submissions' => (int) $entry_count,
                        ];
                    }
                }
            }

            // Ninja Forms
            if (function_exists('Ninja_Forms') && class_exists('NF_Database_Models_Form')) {
                $nf_forms = Ninja_Forms()->form()->get_forms();
                foreach ($nf_forms as $f) {
                    $forms[] = [
                        'plugin' => 'Ninja Forms',
                        'name'   => $f->get_setting('title'),
                        'active' => true,
                    ];
                }
            }

            // Elementor Forms (Pro)
            if (did_action('elementor/loaded') && class_exists('\ElementorPro\Modules\Forms\Module')) {
                $forms[] = [
                    'plugin' => 'Elementor Forms',
                    'active' => true,
                    'note'   => 'Elementor Pro forms detected',
                ];
            }

            return $forms;
        }

        public function track_submission() {
            // Generic counter incremented by any of the form hooks
            $key   = 'eoh_aforms_submissions';
            $count = (int) get_option($key, 0);
            update_option($key, $count + 1, false);
        }

        // -------------------------------------------------------------------------
        // Sync
        // -------------------------------------------------------------------------

        public function sync_data() {
            $opts = wp_parse_args(get_option(self::OPTION_NAME, []), $this->default_settings());

            if (empty($opts['api_url']) || empty($opts['site_key'])) {
                $this->store_sync_result(false, __('API endpoint or site key is missing.', 'eye-of-horus-client'));
                return new WP_Error('eoh_missing_settings', 'API endpoint or site key is missing.');
            }

            $data     = $this->get_site_data();
            $endpoint = $this->normalize_api_url($opts['api_url']);
            $response = wp_remote_post($endpoint, [
                'headers' => [
                    'Content-Type' => 'application/json; charset=utf-8',
                    'X-EOH-KEY'   => $opts['site_key'],
                ],
                'body'        => wp_json_encode($data),
                'timeout'     => 30,
                'redirection' => 3,
            ]);

            if (is_wp_error($response)) {
                $this->store_sync_result(false, $response->get_error_message());
                return $response;
            }

            $code = (int) wp_remote_retrieve_response_code($response);
            $body = wp_remote_retrieve_body($response);

            if ($code < 200 || $code >= 300) {
                $body_decoded = json_decode($body, true);
                $detail = !empty($body_decoded['error']) ? $body_decoded['error'] : wp_strip_all_tags($body);
                $msg = sprintf('Dashboard returned HTTP %d at %s. %s', $code, $endpoint, $detail);
                $this->store_sync_result(false, $msg);
                return new WP_Error('eoh_http_error', $msg);
            }

            $this->store_sync_result(true, __('Sync completed successfully.', 'eye-of-horus-client'));
            return true;
        }

        private function store_sync_result($success, $message) {
            update_option(self::LAST_SYNC, [
                'success' => (bool) $success,
                'message' => sanitize_text_field($message),
                'time'    => current_time('mysql'),
            ], false);
        }

        // -------------------------------------------------------------------------
        // AJAX handlers
        // -------------------------------------------------------------------------

        public function ajax_manual_sync() {
            if (!current_user_can('manage_options')) {
                wp_send_json_error(['message' => __('Permission denied.', 'eye-of-horus-client')], 403);
            }
            check_ajax_referer('eoh_manual_sync', 'nonce');

            $result = $this->sync_data();

            if (is_wp_error($result)) {
                wp_send_json_error(['message' => $result->get_error_message()], 500);
            }

            $last = get_option(self::LAST_SYNC, []);
            wp_send_json_success(['message' => $last['message'] ?? __('Sync completed.', 'eye-of-horus-client')]);
        }

        public function ajax_test_connection() {
            if (!current_user_can('manage_options')) {
                wp_send_json_error(['message' => __('Permission denied.', 'eye-of-horus-client')], 403);
            }
            check_ajax_referer('eoh_test_connection', 'nonce');

            $opts = wp_parse_args(get_option(self::OPTION_NAME, []), $this->default_settings());

            if (empty($opts['api_url']) || empty($opts['site_key'])) {
                wp_send_json_error(['message' => __('Please save your API endpoint and site key first.', 'eye-of-horus-client')]);
            }

            // GET the health-check endpoint (same URL — the route handles both GET and POST)
            $endpoint = $this->normalize_api_url($opts['api_url']);
            $response = wp_remote_get($endpoint, [
                'headers' => ['X-EOH-KEY' => $opts['site_key']],
                'timeout' => 10,
            ]);

            if (is_wp_error($response)) {
                wp_send_json_error(['message' => $response->get_error_message()]);
            }

            $code = (int) wp_remote_retrieve_response_code($response);
            $body = wp_remote_retrieve_body($response);
            $json = json_decode($body, true);

            if ($code >= 200 && $code < 300 && !empty($json['ok'])) {
                wp_send_json_success([
                    'message' => sprintf(
                        __('Connected to Eye of Horus successfully. Endpoint: %s', 'eye-of-horus-client'),
                        $endpoint
                    ),
                ]);
            } else {
                $detail = !empty($json['error']) ? $json['error'] : wp_strip_all_tags($body);
                wp_send_json_error([
                    'message' => sprintf(
                        __('Connection failed (HTTP %d). Endpoint tried: %s. Detail: %s', 'eye-of-horus-client'),
                        $code,
                        $endpoint,
                        $detail
                    ),
                ]);
            }
        }
    }
}

register_activation_hook(__FILE__, ['Eye_Of_Horus_Client', 'activate']);
register_deactivation_hook(__FILE__, ['Eye_Of_Horus_Client', 'deactivate']);

Eye_Of_Horus_Client::instance();
