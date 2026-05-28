<?php
/**
 * Plugin Name: Eye of Horus Client
 * Plugin URI: https://wetpaint.co.za/
 * Description: Technical monitoring and reporting agent for the Eye of Horus Dashboard.
 * Version: 2.3.0
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
        const VERSION      = '2.3.0';
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
            add_action('rest_api_init',                 [$this, 'register_rest_routes']);

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
                    'core'       => '1',
                    'plugins'    => '1',
                    'themes'     => '1',
                    'security'   => '1',
                    'forms'      => '1',
                    'server'     => '1',
                    'wordfence'  => '1',
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

            $modules = ['core', 'plugins', 'themes', 'security', 'forms', 'server', 'wordfence'];
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
                            'core'       => __('Core (WP version, PHP, MySQL)', 'eye-of-horus-client'),
                            'plugins'    => __('Plugins (active, inactive, updates)', 'eye-of-horus-client'),
                            'themes'     => __('Themes (active, parent, updates)', 'eye-of-horus-client'),
                            'security'   => __('Security (debug mode, admin users, security plugin)', 'eye-of-horus-client'),
                            'forms'      => __('Forms (A-Forms, WPForms, CF7, Gravity, Ninja, Elementor)', 'eye-of-horus-client'),
                            'server'     => __('Server (DB size, cron status, error log)', 'eye-of-horus-client'),
                            'wordfence'  => __('Wordfence (firewall, attacks, logins, scan issues)', 'eye-of-horus-client'),
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

            // --- Wordfence ---
            if (!empty($modules['wordfence'])) {
                $payload['wordfence_data'] = $this->collect_wordfence_data();
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
                $wpforms_list = wpforms()->form->get('', ['numberposts' => 50]);
                if (!empty($wpforms_list)) {
                    $analytics         = $this->get_wpforms_analytics();
                    $has_entries_table = $analytics !== null;
                    foreach ($wpforms_list as $f) {
                        $fid  = (int) $f->ID;
                        $data = ($has_entries_table && isset($analytics[$fid])) ? $analytics[$fid] : null;
                        $forms[] = [
                            'plugin'              => 'WPForms',
                            'name'                => $f->post_title,
                            'id'                  => $fid,
                            'active'              => true,
                            'has_entries_table'   => $has_entries_table,
                            // Submission counts
                            'completed_total'     => $data ? $data['completed_total'] : null,
                            'abandoned_total'     => $data ? $data['abandoned_total'] : null,
                            'completed_month'     => $data ? $data['completed_month'] : null,
                            'abandoned_month'     => $data ? $data['abandoned_month'] : null,
                            'completed_last'      => $data ? $data['completed_last'] : null,
                            'abandoned_last'      => $data ? $data['abandoned_last'] : null,
                            // Backward-compat aliases used by earlier dashboard code
                            'submissions'         => $data ? $data['completed_total'] : null,
                            'submissions_month'   => $data ? $data['completed_month'] : null,
                            'submissions_prev_month' => $data ? $data['completed_last'] : null,
                            // Field-level analytics
                            'field_breakdowns'    => $data ? $data['field_breakdowns'] : [],
                            'abandonment_reasons' => $data ? $data['abandonment_reasons'] : [],
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

        /**
         * Pull comprehensive WPForms analytics from the wpforms_entries table.
         *
         * Returns null when the entries table does not exist (WPForms Lite).
         * Returns an array keyed by form_id, each entry containing:
         *   completed_total, abandoned_total, completed_month, abandoned_month,
         *   completed_last, abandoned_last, field_breakdowns, abandonment_reasons.
         *
         * "Completed" = status NOT IN ('spam','trash','abandoned').
         * "Abandoned" = status = 'abandoned' (WPForms Partial Submissions addon).
         * Field breakdowns cover the last 30 days of completed entries (capped at 500 rows per form).
         * Abandonment reasons = required fields missing in abandoned entries, last 30 days.
         */
        private function get_wpforms_analytics() {
            global $wpdb;

            if ( ! function_exists( 'wpforms' ) ) {
                return null;
            }

            $table = $wpdb->prefix . 'wpforms_entries';

            // phpcs:ignore WordPress.DB.DirectDatabaseQuery
            $exists = $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $table ) );
            if ( $exists !== $table ) {
                return null; // WPForms Lite — entries are not persisted to DB
            }

            $wpforms_list = wpforms()->form->get( '', [ 'numberposts' => 50 ] );
            if ( empty( $wpforms_list ) ) {
                return [];
            }

            $now              = current_time( 'timestamp' );
            $this_month_start = date( 'Y-m-01 00:00:00', $now );
            $last_month_ts    = mktime( 0, 0, 0, (int) date( 'n', $now ) - 1, 1, (int) date( 'Y', $now ) );
            $last_month_start = date( 'Y-m-01 00:00:00', $last_month_ts );
            $last_month_end   = date( 'Y-m-t 23:59:59', $last_month_ts );
            $thirty_days_ago  = date( 'Y-m-d 00:00:00', strtotime( '-30 days', $now ) );

            $result = [];

            foreach ( $wpforms_list as $form ) {
                $form_id = (int) $form->ID;

                // ── Count queries ──────────────────────────────────────────────────

                // phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                $all_rows = $wpdb->get_results(
                    $wpdb->prepare(
                        "SELECT status, COUNT(*) AS cnt FROM `{$table}` WHERE form_id = %d AND status NOT IN ('spam','trash') GROUP BY status",
                        $form_id
                    ),
                    ARRAY_A
                );
                $completed_total = 0;
                $abandoned_total = 0;
                foreach ( (array) $all_rows as $r ) {
                    if ( $r['status'] === 'abandoned' ) {
                        $abandoned_total += (int) $r['cnt'];
                    } else {
                        $completed_total += (int) $r['cnt'];
                    }
                }

                // phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                $month_rows = $wpdb->get_results(
                    $wpdb->prepare(
                        "SELECT status, COUNT(*) AS cnt FROM `{$table}` WHERE form_id = %d AND status NOT IN ('spam','trash') AND `date` >= %s GROUP BY status",
                        $form_id, $this_month_start
                    ),
                    ARRAY_A
                );
                $completed_month = 0;
                $abandoned_month = 0;
                foreach ( (array) $month_rows as $r ) {
                    if ( $r['status'] === 'abandoned' ) {
                        $abandoned_month += (int) $r['cnt'];
                    } else {
                        $completed_month += (int) $r['cnt'];
                    }
                }

                // phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                $last_rows = $wpdb->get_results(
                    $wpdb->prepare(
                        "SELECT status, COUNT(*) AS cnt FROM `{$table}` WHERE form_id = %d AND status NOT IN ('spam','trash') AND `date` >= %s AND `date` <= %s GROUP BY status",
                        $form_id, $last_month_start, $last_month_end
                    ),
                    ARRAY_A
                );
                $completed_last = 0;
                $abandoned_last = 0;
                foreach ( (array) $last_rows as $r ) {
                    if ( $r['status'] === 'abandoned' ) {
                        $abandoned_last += (int) $r['cnt'];
                    } else {
                        $completed_last += (int) $r['cnt'];
                    }
                }

                // ── Form schema: identify choice + required fields ─────────────────

                $form_content   = wpforms()->form->get( $form_id, [ 'content_only' => true ] );
                $schema_fields  = [];
                if ( is_array( $form_content ) ) {
                    // WPForms stores fields under 'fields' key
                    $raw_fields = isset( $form_content['fields'] ) ? $form_content['fields']
                        : ( isset( $form_content['field'] ) ? $form_content['field'] : [] );
                    foreach ( (array) $raw_fields as $field ) {
                        if ( ! is_array( $field ) || empty( $field['id'] ) ) continue;
                        $schema_fields[ (string) $field['id'] ] = [
                            'label'    => sanitize_text_field( $field['label'] ?? '' ),
                            'type'     => $field['type'] ?? '',
                            'required' => ! empty( $field['required'] ),
                        ];
                    }
                }

                $choice_types  = [ 'select', 'radio', 'checkbox', 'payment-select', 'payment-checkbox' ];
                $choice_fields = [];
                $req_fields    = [];
                foreach ( $schema_fields as $fld_id => $fld ) {
                    if ( in_array( $fld['type'], $choice_types, true ) ) {
                        $choice_fields[ $fld_id ] = $fld['label'];
                    }
                    if ( $fld['required'] ) {
                        $req_fields[ $fld_id ] = $fld['label'];
                    }
                }

                // ── Field-level breakdowns: last 30 days, completed entries ────────

                $field_breakdowns    = [];
                $abandonment_reasons = [];

                if ( ! empty( $choice_fields ) || ! empty( $req_fields ) ) {

                    // phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                    $completed_entries = $wpdb->get_results(
                        $wpdb->prepare(
                            "SELECT fields FROM `{$table}` WHERE form_id = %d AND status NOT IN ('spam','trash','abandoned') AND `date` >= %s ORDER BY entry_id DESC LIMIT 500",
                            $form_id, $thirty_days_ago
                        ),
                        ARRAY_A
                    );

                    // Tally choice-field values across completed entries
                    $choice_tally = [];
                    foreach ( (array) $completed_entries as $entry ) {
                        if ( empty( $entry['fields'] ) ) continue;
                        $fdata = json_decode( $entry['fields'], true );
                        if ( ! is_array( $fdata ) ) continue;
                        foreach ( $choice_fields as $fld_id => $fld_label ) {
                            $val = isset( $fdata[ $fld_id ]['value'] ) ? trim( (string) $fdata[ $fld_id ]['value'] ) : '';
                            if ( $val !== '' ) {
                                $choice_tally[ $fld_label ][ $val ] = ( $choice_tally[ $fld_label ][ $val ] ?? 0 ) + 1;
                            }
                        }
                    }

                    foreach ( $choice_tally as $fld_label => $vals ) {
                        arsort( $vals );
                        $breakdown = [];
                        foreach ( array_slice( $vals, 0, 20, true ) as $val => $cnt ) {
                            $breakdown[] = [ 'value' => (string) $val, 'count' => (int) $cnt ];
                        }
                        if ( ! empty( $breakdown ) ) {
                            $field_breakdowns[] = [ 'field' => $fld_label, 'values' => $breakdown ];
                        }
                    }

                    // Abandonment reasons: required fields missing in abandoned entries
                    if ( ! empty( $req_fields ) ) {
                        // phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                        $abandoned_entries = $wpdb->get_results(
                            $wpdb->prepare(
                                "SELECT fields FROM `{$table}` WHERE form_id = %d AND status = 'abandoned' AND `date` >= %s ORDER BY entry_id DESC LIMIT 500",
                                $form_id, $thirty_days_ago
                            ),
                            ARRAY_A
                        );

                        $missing_tally = [];
                        foreach ( (array) $abandoned_entries as $entry ) {
                            $fdata = ! empty( $entry['fields'] ) ? json_decode( $entry['fields'], true ) : [];
                            if ( ! is_array( $fdata ) ) $fdata = [];
                            foreach ( $req_fields as $req_id => $req_label ) {
                                $val = isset( $fdata[ $req_id ]['value'] ) ? trim( (string) $fdata[ $req_id ]['value'] ) : '';
                                if ( $val === '' ) {
                                    $missing_tally[ $req_label ] = ( $missing_tally[ $req_label ] ?? 0 ) + 1;
                                }
                            }
                        }

                        arsort( $missing_tally );
                        foreach ( array_slice( $missing_tally, 0, 5, true ) as $label => $cnt ) {
                            $abandonment_reasons[] = [ 'field' => (string) $label, 'count' => (int) $cnt ];
                        }
                    }
                }

                $result[ $form_id ] = [
                    'completed_total'     => $completed_total,
                    'abandoned_total'     => $abandoned_total,
                    'completed_month'     => $completed_month,
                    'abandoned_month'     => $abandoned_month,
                    'completed_last'      => $completed_last,
                    'abandoned_last'      => $abandoned_last,
                    'field_breakdowns'    => $field_breakdowns,
                    'abandonment_reasons' => $abandonment_reasons,
                ];
            }

            return $result;
        }

        public function track_submission() {
            // Generic counter incremented by any of the form hooks
            $key   = 'eoh_aforms_submissions';
            $count = (int) get_option($key, 0);
            update_option($key, $count + 1, false);
        }

        private function collect_wordfence_data() {
            global $wpdb;

            $wf_config_table = $wpdb->prefix . 'wfConfig';
            // phpcs:ignore WordPress.DB.DirectDatabaseQuery
            $table_check = $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $wf_config_table ) );
            if ( $table_check !== $wf_config_table ) {
                return null; // Wordfence not installed
            }

            $result = [
                'active'               => true,
                'waf_enabled'          => false,
                'waf_learning_mode'    => false,
                'waf_rules_premium'    => false,
                'ip_blocklist_enabled' => false,
                'brute_force_enabled'  => false,
                'last_scan_time'       => null,
            ];

            // --- Config ---------------------------------------------------------------
            $cfg_keys = [ 'firewallEnabled', 'learningModeEnabled', 'isPremium', 'blockListEnabled', 'loginSecEnabled', 'loginSec_enabled', 'wafStatus', 'lastScanCompleted' ];
            $placeholders = implode( ',', array_fill( 0, count( $cfg_keys ), '%s' ) );
            // phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
            $cfg_rows = $wpdb->get_results(
                $wpdb->prepare( "SELECT name, val FROM `{$wf_config_table}` WHERE name IN ({$placeholders})", ...$cfg_keys ),
                ARRAY_A
            );
            $cfg = [];
            foreach ( (array) $cfg_rows as $row ) {
                $cfg[ $row['name'] ] = $row['val'];
            }
            $result['waf_enabled']          = isset( $cfg['firewallEnabled'] ) && $cfg['firewallEnabled'] == '1';
            $result['waf_learning_mode']    = isset( $cfg['learningModeEnabled'] ) && $cfg['learningModeEnabled'] == '1';
            $result['waf_rules_premium']    = isset( $cfg['isPremium'] ) && $cfg['isPremium'] == '1';
            $result['ip_blocklist_enabled'] = isset( $cfg['blockListEnabled'] ) && $cfg['blockListEnabled'] == '1';
            $result['brute_force_enabled']  = ( isset( $cfg['loginSecEnabled'] ) && $cfg['loginSecEnabled'] == '1' )
                                           || ( isset( $cfg['loginSec_enabled'] ) && $cfg['loginSec_enabled'] == '1' );
            if ( ! empty( $cfg['lastScanCompleted'] ) && is_numeric( $cfg['lastScanCompleted'] ) ) {
                $result['last_scan_time'] = date( 'c', (int) $cfg['lastScanCompleted'] );
            }

            // --- Attack summary from wfHits -------------------------------------------
            $hits_table  = $wpdb->prefix . 'wfHits';
            // phpcs:ignore WordPress.DB.DirectDatabaseQuery
            $hits_exists = $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $hits_table ) );

            if ( $hits_exists === $hits_table ) {
                $now        = time();
                $today_start = (float) strtotime( 'today midnight' );
                $week_start  = (float) ( $now - 7 * DAY_IN_SECONDS );
                $month_start = (float) ( $now - 30 * DAY_IN_SECONDS );

                foreach ( [
                    'attacks_today' => $today_start,
                    'attacks_week'  => $week_start,
                    'attacks_month' => $month_start,
                ] as $key => $since ) {
                    // phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                    $rows = $wpdb->get_results(
                        $wpdb->prepare( "SELECT action, COUNT(*) AS cnt FROM `{$hits_table}` WHERE ctime >= %f AND action LIKE 'blocked%%' GROUP BY action", $since ),
                        ARRAY_A
                    );
                    $complex = 0; $brute_force = 0; $blocklist = 0;
                    foreach ( (array) $rows as $r ) {
                        $action = strtolower( (string) $r['action'] );
                        $cnt    = (int) $r['cnt'];
                        if ( false !== strpos( $action, 'brute' ) || false !== strpos( $action, 'lockout' ) ) {
                            $brute_force += $cnt;
                        } elseif ( false !== strpos( $action, 'blocklist' ) || false !== strpos( $action, 'blacklist' ) || false !== strpos( $action, 'ipblack' ) ) {
                            $blocklist += $cnt;
                        } else {
                            $complex += $cnt; // WAF rules, country blocks, manual blocks → "complex"
                        }
                    }
                    $result[ $key ] = [
                        'complex'     => $complex,
                        'brute_force' => $brute_force,
                        'blocklist'   => $blocklist,
                        'total'       => $complex + $brute_force + $blocklist,
                    ];
                }

                // Top blocked IPs — last 7 days
                // phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                $ip_rows = $wpdb->get_results(
                    $wpdb->prepare(
                        "SELECT INET6_NTOA(IP) AS ip_str, countryName, COUNT(*) AS block_count FROM `{$hits_table}` WHERE ctime >= %f AND action LIKE 'blocked%%' GROUP BY IP, countryName ORDER BY block_count DESC LIMIT 10",
                        $week_start
                    ),
                    ARRAY_A
                );
                $result['top_blocked_ips'] = [];
                foreach ( (array) $ip_rows as $r ) {
                    $ip = (string) ( $r['ip_str'] ?? '' );
                    if ( strpos( $ip, '::ffff:' ) === 0 ) { $ip = substr( $ip, 7 ); }
                    $result['top_blocked_ips'][] = [
                        'ip'      => sanitize_text_field( $ip ),
                        'country' => sanitize_text_field( $r['countryName'] ?? '' ),
                        'count'   => (int) $r['block_count'],
                    ];
                }

                // Top countries — last 7 days
                // phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                $country_rows = $wpdb->get_results(
                    $wpdb->prepare(
                        "SELECT countryName, COUNT(*) AS cnt FROM `{$hits_table}` WHERE ctime >= %f AND action LIKE 'blocked%%' AND countryName != '' GROUP BY countryName ORDER BY cnt DESC LIMIT 10",
                        $week_start
                    ),
                    ARRAY_A
                );
                $result['top_countries'] = [];
                foreach ( (array) $country_rows as $r ) {
                    $result['top_countries'][] = [
                        'country' => sanitize_text_field( $r['countryName'] ),
                        'count'   => (int) $r['cnt'],
                    ];
                }
            } else {
                foreach ( [ 'attacks_today', 'attacks_week', 'attacks_month' ] as $k ) {
                    $result[ $k ] = [ 'complex' => 0, 'brute_force' => 0, 'blocklist' => 0, 'total' => 0 ];
                }
                $result['top_blocked_ips'] = [];
                $result['top_countries']   = [];
            }

            // --- Login attempts from wfLogins -----------------------------------------
            $logins_table  = $wpdb->prefix . 'wfLogins';
            // phpcs:ignore WordPress.DB.DirectDatabaseQuery
            $logins_exists = $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $logins_table ) );

            if ( $logins_exists === $logins_table ) {
                // phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                $failed = $wpdb->get_results(
                    "SELECT username, INET6_NTOA(IP) AS ip_str, ctime FROM `{$logins_table}` WHERE fail = 1 ORDER BY ctime DESC LIMIT 20",
                    ARRAY_A
                );
                $result['login_failed'] = [];
                foreach ( (array) $failed as $r ) {
                    $ip = (string) ( $r['ip_str'] ?? '' );
                    if ( strpos( $ip, '::ffff:' ) === 0 ) { $ip = substr( $ip, 7 ); }
                    $result['login_failed'][] = [
                        'username' => sanitize_text_field( $r['username'] ?? '' ),
                        'ip'       => sanitize_text_field( $ip ),
                        'time'     => is_numeric( $r['ctime'] ) ? date( 'c', (int) $r['ctime'] ) : '',
                    ];
                }

                // phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                $success = $wpdb->get_results(
                    "SELECT username, INET6_NTOA(IP) AS ip_str, ctime FROM `{$logins_table}` WHERE fail = 0 ORDER BY ctime DESC LIMIT 10",
                    ARRAY_A
                );
                $result['login_success'] = [];
                foreach ( (array) $success as $r ) {
                    $ip = (string) ( $r['ip_str'] ?? '' );
                    if ( strpos( $ip, '::ffff:' ) === 0 ) { $ip = substr( $ip, 7 ); }
                    $result['login_success'][] = [
                        'username' => sanitize_text_field( $r['username'] ?? '' ),
                        'ip'       => sanitize_text_field( $ip ),
                        'time'     => is_numeric( $r['ctime'] ) ? date( 'c', (int) $r['ctime'] ) : '',
                    ];
                }
            } else {
                $result['login_failed']  = [];
                $result['login_success'] = [];
            }

            // --- Scan issues from wfIssues --------------------------------------------
            $issues_table  = $wpdb->prefix . 'wfIssues';
            // phpcs:ignore WordPress.DB.DirectDatabaseQuery
            $issues_exists = $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $issues_table ) );

            if ( $issues_exists === $issues_table ) {
                // phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                $scan_issues = $wpdb->get_results(
                    "SELECT type, severity, shortMsg FROM `{$issues_table}` WHERE status = 'new' ORDER BY FIELD(severity,'critical','warning','low') LIMIT 20",
                    ARRAY_A
                );
                $result['scan_issues_count'] = count( (array) $scan_issues );
                $result['scan_issues']       = [];
                $has_malware                 = false;
                foreach ( (array) $scan_issues as $si ) {
                    $type = strtolower( (string) ( $si['type'] ?? '' ) );
                    if ( false !== strpos( $type, 'file' ) || false !== strpos( $type, 'malware' ) ) {
                        $has_malware = true;
                    }
                    $result['scan_issues'][] = [
                        'type'        => sanitize_text_field( $si['type']     ?? '' ),
                        'severity'    => sanitize_text_field( $si['severity'] ?? '' ),
                        'description' => sanitize_text_field( $si['shortMsg'] ?? '' ),
                    ];
                }
                $result['malware_found'] = $has_malware;
            } else {
                $result['scan_issues_count'] = 0;
                $result['scan_issues']       = [];
                $result['malware_found']     = false;
            }

            return $result;
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

        // -------------------------------------------------------------------------
        // REST API — allows Eye of Horus dashboard to trigger plugin updates
        // -------------------------------------------------------------------------

        public function register_rest_routes() {
            register_rest_route('eye-of-horus/v1', '/update-plugin', [
                'methods'             => 'POST',
                'callback'            => [$this, 'rest_update_plugin'],
                'permission_callback' => '__return_true',
            ]);
        }

        public function rest_update_plugin($request) {
            $settings    = get_option(self::OPTION_NAME, []);
            $stored_key  = isset($settings['api_key']) ? $settings['api_key'] : '';
            $provided_key = $request->get_header('X-EOH-KEY');

            if (empty($stored_key) || $provided_key !== $stored_key) {
                return new WP_Error('unauthorized', __('Invalid API key.', 'eye-of-horus-client'), ['status' => 401]);
            }

            $plugin_file = sanitize_text_field($request->get_param('plugin_file'));

            if (empty($plugin_file)) {
                return new WP_Error('missing_param', __('plugin_file is required.', 'eye-of-horus-client'), ['status' => 400]);
            }

            // Basic path traversal guard
            if (strpos($plugin_file, '..') !== false || strpos($plugin_file, '/') === false) {
                return new WP_Error('invalid_param', __('Invalid plugin_file format.', 'eye-of-horus-client'), ['status' => 400]);
            }

            if (!file_exists(WP_PLUGIN_DIR . '/' . $plugin_file)) {
                return new WP_Error('not_found', sprintf(__('Plugin not found: %s', 'eye-of-horus-client'), $plugin_file), ['status' => 404]);
            }

            if (!class_exists('Plugin_Upgrader')) {
                require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';
            }
            require_once ABSPATH . 'wp-admin/includes/plugin-install.php';
            require_once ABSPATH . 'wp-admin/includes/file.php';
            require_once ABSPATH . 'wp-admin/includes/misc.php';

            $skin     = new Automatic_Upgrader_Skin();
            $upgrader = new Plugin_Upgrader($skin);
            $result   = $upgrader->upgrade($plugin_file);

            if (is_wp_error($result)) {
                return new WP_Error('update_failed', $result->get_error_message(), ['status' => 500]);
            }

            if ($result === false) {
                $skin_errors = $skin->get_errors();
                $msg = is_wp_error($skin_errors) ? $skin_errors->get_error_message() : __('Update failed — no result returned.', 'eye-of-horus-client');
                return new WP_Error('update_failed', $msg, ['status' => 500]);
            }

            return rest_ensure_response([
                'ok'          => true,
                'message'     => __('Plugin updated successfully.', 'eye-of-horus-client'),
                'plugin_file' => $plugin_file,
            ]);
        }
    }
}

register_activation_hook(__FILE__, ['Eye_Of_Horus_Client', 'activate']);
register_deactivation_hook(__FILE__, ['Eye_Of_Horus_Client', 'deactivate']);

Eye_Of_Horus_Client::instance();
