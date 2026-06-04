<?php
/**
 * Plugin Name: Eye of Horus Client
 * Plugin URI: https://wetpaint.co.za/
 * Description: Technical monitoring and reporting agent for the Eye of Horus Dashboard.
 * Version: 2.4.3
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
        const VERSION      = '2.4.3';
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
            add_action('wp_footer',             [$this, 'maybe_print_rum_tag']);
            add_action('admin_enqueue_scripts', [$this, 'enqueue_admin_assets']);
            add_action('eoh_cron_runner',       [$this, 'cron_sync_data']);
            add_action(self::CRON_HOOK,         [$this, 'sync_data']);
            add_action('wp_ajax_eoh_manual_sync',       [$this, 'ajax_manual_sync']);
            add_action('wp_ajax_eoh_test_connection',   [$this, 'ajax_test_connection']);
            add_action('rest_api_init',                 [$this, 'register_rest_routes']);
            add_filter('cron_schedules',                [$this, 'add_custom_cron_schedules']);
            add_action('update_option_' . self::OPTION_NAME, [$this, 'update_cron_schedule'], 10, 2);

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
            if (!wp_next_scheduled('eoh_cron_runner')) {
                wp_schedule_event(time(), 'five_minutes', 'eoh_cron_runner');
            }
            $ts = wp_next_scheduled(self::CRON_HOOK);
            if ($ts) {
                wp_unschedule_event($ts, self::CRON_HOOK);
            }
        }

        public static function deactivate() {
            $ts = wp_next_scheduled('eoh_cron_runner');
            if ($ts) {
                wp_unschedule_event($ts, 'eoh_cron_runner');
            }
            $old_ts = wp_next_scheduled(self::CRON_HOOK);
            if ($old_ts) {
                wp_unschedule_event($old_ts, self::CRON_HOOK);
            }
        }

        public function add_custom_cron_schedules($schedules) {
            $schedules['five_minutes'] = [
                'interval' => 5 * MINUTE_IN_SECONDS,
                'display'  => __('Every 5 Minutes', 'eye-of-horus-client'),
            ];
            $schedules['fifteen_minutes'] = [
                'interval' => 15 * MINUTE_IN_SECONDS,
                'display'  => __('Every 15 Minutes', 'eye-of-horus-client'),
            ];
            $schedules['half_hour'] = [
                'interval' => 30 * MINUTE_IN_SECONDS,
                'display'  => __('Every 30 Minutes', 'eye-of-horus-client'),
            ];
            $schedules['weekly'] = [
                'interval' => 7 * DAY_IN_SECONDS,
                'display'  => __('Weekly', 'eye-of-horus-client'),
            ];
            return $schedules;
        }

        public function update_cron_schedule($old_value, $new_value) {
            if (!wp_next_scheduled('eoh_cron_runner')) {
                wp_schedule_event(time(), 'five_minutes', 'eoh_cron_runner');
            }
            $old_ts = wp_next_scheduled(self::CRON_HOOK);
            if ($old_ts) {
                wp_unschedule_event($old_ts, self::CRON_HOOK);
            }
        }

        private function get_interval_seconds($interval) {
            switch ($interval) {
                case 'five_minutes':
                    return 5 * MINUTE_IN_SECONDS;
                case 'fifteen_minutes':
                    return 15 * MINUTE_IN_SECONDS;
                case 'half_hour':
                    return 30 * MINUTE_IN_SECONDS;
                case 'hourly':
                    return HOUR_IN_SECONDS;
                case 'twicedaily':
                    return 12 * HOUR_IN_SECONDS;
                case 'daily':
                    return DAY_IN_SECONDS;
                case 'weekly':
                    return 7 * DAY_IN_SECONDS;
                default:
                    return 0; // Disabled
            }
        }

        public function cron_sync_data() {
            $opts = wp_parse_args(get_option(self::OPTION_NAME, []), $this->default_settings());
            $now = time();

            // 1. Check heartbeat
            $hb_sec = $this->get_interval_seconds($opts['heartbeat_interval'] ?? 'fifteen_minutes');
            $last_hb = (int) get_option('eoh_last_sent_heartbeat', 0);
            $hb_due = ($hb_sec > 0 && ($now - $last_hb) >= $hb_sec);

            // 2. Check each module
            $modules = ['core', 'plugins', 'themes', 'security', 'forms', 'server', 'wordfence'];
            $any_module_due = false;
            $due_modules = [];

            foreach ($modules as $mod) {
                $mod_interval = $opts[$mod . '_interval'] ?? 'daily';
                $mod_sec = $this->get_interval_seconds($mod_interval);
                $last_sent = (int) get_option('eoh_last_sent_' . $mod, 0);

                if ($mod_sec > 0 && ($now - $last_sent) >= $mod_sec) {
                    $due_modules[$mod] = true;
                    $any_module_due = true;
                } else {
                    $due_modules[$mod] = false;
                }
            }

            // If neither heartbeat nor any module is due, skip
            if (!$hb_due && !$any_module_due) {
                return;
            }

            $this->sync_data($due_modules, $hb_due);
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
                'heartbeat_interval'=> 'fifteen_minutes',
                'core_interval'     => 'daily',
                'plugins_interval'  => 'daily',
                'themes_interval'   => 'daily',
                'security_interval' => 'daily',
                'forms_interval'    => 'daily',
                'server_interval'   => 'daily',
                'wordfence_interval'=> 'daily',
                'debug_mode'        => '',
                'rum_consent'       => '1', // allow Eye of Horus front-end analytics locally
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

            // RUM consent is a checkbox: present = allowed, absent = opted out.
            $out['rum_consent'] = !empty($input['rum_consent']) ? '1' : '';

            $allowed = ['disabled', 'five_minutes', 'fifteen_minutes', 'half_hour', 'hourly', 'twicedaily', 'daily', 'weekly'];

            if (isset($input['heartbeat_interval'])) {
                $hb = sanitize_text_field($input['heartbeat_interval']);
                $out['heartbeat_interval'] = in_array($hb, $allowed, true) ? $hb : 'fifteen_minutes';
            }

            $modules = ['core', 'plugins', 'themes', 'security', 'forms', 'server', 'wordfence'];
            foreach ($modules as $mod) {
                $key = $mod . '_interval';
                if (isset($input[$key])) {
                    $val = sanitize_text_field($input[$key]);
                    $out[$key] = in_array($val, $allowed, true) ? $val : 'daily';
                }
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

        private function render_module_frequency_row($key, $label) {
            $opts = wp_parse_args(get_option(self::OPTION_NAME, []), $this->default_settings());
            $current_val = $opts[$key . '_interval'] ?? 'daily';
            ?>
            <tr>
                <th scope="row">
                    <label for="eoh-<?php echo esc_attr($key); ?>-interval"><?php echo esc_html($label); ?></label>
                </th>
                <td>
                    <select id="eoh-<?php echo esc_attr($key); ?>-interval" name="<?php echo esc_attr(self::OPTION_NAME); ?>[<?php echo esc_attr($key); ?>_interval]">
                        <option value="disabled" <?php selected($current_val, 'disabled'); ?>><?php esc_html_e('Disabled', 'eye-of-horus-client'); ?></option>
                        <option value="five_minutes" <?php selected($current_val, 'five_minutes'); ?>><?php esc_html_e('Every 5 Minutes', 'eye-of-horus-client'); ?></option>
                        <option value="fifteen_minutes" <?php selected($current_val, 'fifteen_minutes'); ?>><?php esc_html_e('Every 15 Minutes', 'eye-of-horus-client'); ?></option>
                        <option value="half_hour" <?php selected($current_val, 'half_hour'); ?>><?php esc_html_e('Every 30 Minutes', 'eye-of-horus-client'); ?></option>
                        <option value="hourly" <?php selected($current_val, 'hourly'); ?>><?php esc_html_e('Hourly', 'eye-of-horus-client'); ?></option>
                        <option value="twicedaily" <?php selected($current_val, 'twicedaily'); ?>><?php esc_html_e('Twice Daily (12 Hours)', 'eye-of-horus-client'); ?></option>
                        <option value="daily" <?php selected($current_val, 'daily'); ?>><?php esc_html_e('Daily (24 Hours)', 'eye-of-horus-client'); ?></option>
                        <option value="weekly" <?php selected($current_val, 'weekly'); ?>><?php esc_html_e('Weekly', 'eye-of-horus-client'); ?></option>
                    </select>
                </td>
            </tr>
            <?php
        }

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
                        <tr>
                            <th scope="row">
                                <label for="eoh-heartbeat-interval"><?php esc_html_e('Uptime Heartbeat Frequency', 'eye-of-horus-client'); ?></label>
                            </th>
                            <td>
                                <select id="eoh-heartbeat-interval" name="<?php echo esc_attr(self::OPTION_NAME); ?>[heartbeat_interval]">
                                    <option value="disabled" <?php selected($opts['heartbeat_interval'], 'disabled'); ?>><?php esc_html_e('Disabled', 'eye-of-horus-client'); ?></option>
                                    <option value="five_minutes" <?php selected($opts['heartbeat_interval'], 'five_minutes'); ?>><?php esc_html_e('Every 5 Minutes', 'eye-of-horus-client'); ?></option>
                                    <option value="fifteen_minutes" <?php selected($opts['heartbeat_interval'], 'fifteen_minutes'); ?>><?php esc_html_e('Every 15 Minutes', 'eye-of-horus-client'); ?></option>
                                    <option value="half_hour" <?php selected($opts['heartbeat_interval'], 'half_hour'); ?>><?php esc_html_e('Every 30 Minutes', 'eye-of-horus-client'); ?></option>
                                    <option value="hourly" <?php selected($opts['heartbeat_interval'], 'hourly'); ?>><?php esc_html_e('Hourly', 'eye-of-horus-client'); ?></option>
                                    <option value="twicedaily" <?php selected($opts['heartbeat_interval'], 'twicedaily'); ?>><?php esc_html_e('Twice Daily (12 Hours)', 'eye-of-horus-client'); ?></option>
                                    <option value="daily" <?php selected($opts['heartbeat_interval'], 'daily'); ?>><?php esc_html_e('Daily (24 Hours)', 'eye-of-horus-client'); ?></option>
                                </select>
                                <p class="description"><?php esc_html_e('How often to send a quick availability signal to indicate the site is online.', 'eye-of-horus-client'); ?></p>
                            </td>
                        </tr>
                    </table>

                    <h2><?php esc_html_e('Data Modules Sync Frequency', 'eye-of-horus-client'); ?></h2>
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
                        foreach ($module_labels as $key => $label) {
                            $this->render_module_frequency_row($key, $label);
                        }
                        ?>
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
                        <?php $rum_cfg = get_option('eoh_rum_config', []); ?>
                        <tr>
                            <th scope="row"><?php esc_html_e('Front-end analytics', 'eye-of-horus-client'); ?></th>
                            <td>
                                <label>
                                    <input type="checkbox"
                                        name="<?php echo esc_attr(self::OPTION_NAME); ?>[rum_consent]"
                                        value="1"
                                        <?php checked(!empty($opts['rum_consent'])); ?> />
                                    <?php esc_html_e('Allow Eye of Horus to load its real-user analytics script on this site', 'eye-of-horus-client'); ?>
                                </label>
                                <p class="description">
                                    <?php
                                    if (!empty($rum_cfg['enabled'])) {
                                        esc_html_e('Status: enabled in the Eye of Horus dashboard. The script loads when the box above is ticked.', 'eye-of-horus-client');
                                    } else {
                                        esc_html_e('Status: disabled in the Eye of Horus dashboard. Enable it there first; nothing loads until then.', 'eye-of-horus-client');
                                    }
                                    ?>
                                </p>
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

        public function get_site_data($due_modules = null) {
            $opts    = wp_parse_args(get_option(self::OPTION_NAME, []), $this->default_settings());

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

            $modules = ['core', 'plugins', 'themes', 'security', 'forms', 'server', 'wordfence'];
            foreach ($modules as $mod) {
                // If it is due, or if we are doing a manual sync (due_modules is null)
                $is_due = ($due_modules === null || !empty($due_modules[$mod]));
                
                // If the module is disabled, skip it entirely
                $mod_interval = $opts[$mod . '_interval'] ?? 'daily';
                if ($mod_interval === 'disabled' && $due_modules !== null) {
                    continue;
                }

                if ($is_due) {
                    // Collect fresh data
                    $data = null;
                    switch ($mod) {
                        case 'core':
                            $data = $this->collect_core_data();
                            break;
                        case 'plugins':
                            $data = $this->collect_plugins_data();
                            break;
                        case 'themes':
                            $data = $this->collect_themes_data();
                            break;
                        case 'security':
                            $data = $this->collect_security_data();
                            break;
                        case 'forms':
                            $data = $this->collect_forms_data_wrapper();
                            break;
                        case 'server':
                            $data = $this->collect_server_data();
                            break;
                        case 'wordfence':
                            $data = $this->collect_wordfence_data();
                            break;
                    }
                    if ($data !== null) {
                        update_option('eoh_cache_' . $mod, $data, false);
                    }
                } else {
                    // Use cached data
                    $data = get_option('eoh_cache_' . $mod, null);
                }

                // Add to payload
                if ($data !== null) {
                    if ($mod === 'core') {
                        $payload = array_merge($payload, $data);
                    } elseif ($mod === 'plugins') {
                        $payload['plugin_data'] = $data;
                        if (isset($payload['update_data'])) {
                            $payload['update_data']['plugin_updates'] = count(array_filter($data, fn($p) => !empty($p['update_available'])));
                        }
                    } elseif ($mod === 'themes') {
                        $payload['theme_data'] = $data;
                        if (isset($payload['update_data'])) {
                            $payload['update_data']['theme_updates'] = !empty($data['update_available']) ? 1 : 0;
                        }
                    } else {
                        $payload[$mod . '_data'] = $data;
                    }
                }
            }

            if (!empty($opts['debug_mode'])) {
                error_log('[EOH] Sync payload: ' . wp_json_encode($payload));
            }

            return $payload;
        }

        private function collect_core_data() {
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
            return [
                'wp_version'    => get_bloginfo('version'),
                'php_version'   => phpversion(),
                'mysql_version' => $this->get_mysql_version(),
                'update_data'   => [
                    'core_update'     => $core_update_available,
                    'core_version'    => $core_new_version,
                    'plugin_updates'  => 0,
                    'theme_updates'   => 0,
                ]
            ];
        }

        private function collect_plugins_data() {
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
            return $plugin_list;
        }

        private function collect_themes_data() {
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

            return [
                'name'             => $theme->get('Name'),
                'version'          => $theme->get('Version'),
                'template'         => $theme->get_template(),
                'parent_theme'     => $parent_theme,
                'update_available' => $has_theme_upd,
                'new_version'      => $has_theme_upd ? ($theme_updates->response[$theme_slug]['new_version'] ?? null) : null,
            ];
        }

        private function collect_security_data() {
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

            $log_lines = [];
            $log_path  = WP_CONTENT_DIR . '/debug.log';
            if (is_readable($log_path) && filesize($log_path) > 0) {
                $lines = $this->tail_file($log_path, 20);
                $log_lines = array_map('sanitize_text_field', $lines);
            }

            return [
                'debug_mode'      => (bool) (defined('WP_DEBUG') && WP_DEBUG),
                'admin_users'     => count($admin_users),
                'security_plugin' => $security_plugin,
                'error_log_lines' => $log_lines,
            ];
        }

        private function collect_forms_data_wrapper() {
            return $this->collect_form_data();
        }

        private function collect_server_data() {
            return [
                'db_size_mb'       => $this->get_db_size_mb(),
                'cron_enabled'     => !(defined('DISABLE_WP_CRON') && DISABLE_WP_CRON),
                'site_health_ok'   => $this->get_site_health_status(),
                'language'         => get_bloginfo('language'),
                'timezone'         => wp_timezone_string(),
                'admin_email'      => get_bloginfo('admin_email'),
            ];
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

        // Resolve a Wordfence table's real name case-insensitively. Wordfence
        // uses lowercase table names (wp_wfconfig, wp_wfhits, …); a camelCase
        // `SHOW TABLES LIKE` never matches on case-sensitive MySQL hosts, which
        // made Wordfence look "not installed". Returns the actual name, or null.
        private function wf_table( $suffix ) {
            global $wpdb;
            // phpcs:ignore WordPress.DB.DirectDatabaseQuery
            $actual = $wpdb->get_var( $wpdb->prepare(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = %s AND LOWER(table_name) = LOWER(%s) LIMIT 1",
                DB_NAME,
                $wpdb->prefix . $suffix
            ) );
            return $actual ? $actual : null;
        }

        private function collect_wordfence_data() {
            global $wpdb;

            $wf_config_table = $this->wf_table( 'wfConfig' );
            if ( empty( $wf_config_table ) ) {
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
            $hits_table = $this->wf_table( 'wfHits' );

            if ( $hits_table ) {
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
            $logins_table = $this->wf_table( 'wfLogins' );

            if ( $logins_table ) {
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
            $issues_table = $this->wf_table( 'wfIssues' );

            if ( $issues_table ) {
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

            // --- TEMP diagnostic (2.4.3) — captures this install's real schema so
            // the field mapping (premium/blocklist/brute-force flags, attack
            // categorisation, top-IP/country columns) can be fixed precisely.
            // Only boolean/enum flags + names are captured — no secrets. Removed
            // in the next release.
            $result['_debug'] = [ 'bool_flags' => [], 'hit_actions' => [], 'hits_columns' => [] ];
            // phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
            $flags = $wpdb->get_results( "SELECT name, val FROM `{$wf_config_table}` WHERE val IN ('0','1','enabled','disabled','learning-mode','learning') ORDER BY name", ARRAY_A );
            foreach ( (array) $flags as $row ) { $result['_debug']['bool_flags'][ $row['name'] ] = $row['val']; }
            if ( ! empty( $hits_table ) ) {
                // phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
                $result['_debug']['hit_actions'] = $wpdb->get_results(
                    $wpdb->prepare( "SELECT action, COUNT(*) AS cnt FROM `{$hits_table}` WHERE ctime >= %f GROUP BY action ORDER BY cnt DESC LIMIT 40", (float) ( time() - 30 * DAY_IN_SECONDS ) ),
                    ARRAY_A
                );
                // phpcs:ignore WordPress.DB.DirectDatabaseQuery
                $result['_debug']['hits_columns'] = $wpdb->get_col( $wpdb->prepare(
                    "SELECT column_name FROM information_schema.columns WHERE table_schema = %s AND LOWER(table_name) = LOWER(%s) ORDER BY ordinal_position",
                    DB_NAME, $hits_table
                ) );
            }

            return $result;
        }

        // -------------------------------------------------------------------------
        // Sync
        // -------------------------------------------------------------------------

        public function sync_data($due_modules = null, $hb_sent = false) {
            $opts = wp_parse_args(get_option(self::OPTION_NAME, []), $this->default_settings());

            if (empty($opts['api_url']) || empty($opts['site_key'])) {
                $this->store_sync_result(false, __('API endpoint or site key is missing.', 'eye-of-horus-client'));
                return new WP_Error('eoh_missing_settings', 'API endpoint or site key is missing.');
            }

            $data = $this->get_site_data($due_modules);
            
            if ($hb_sent) {
                $data['heartbeat'] = true;
            }

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

            // Update run timestamps on successful transmission
            $now = time();
            if ($hb_sent) {
                update_option('eoh_last_sent_heartbeat', $now, false);
            }
            if ($due_modules !== null) {
                foreach ($due_modules as $mod => $is_due) {
                    if ($is_due) {
                        update_option('eoh_last_sent_' . $mod, $now, false);
                    }
                }
            } else {
                update_option('eoh_last_sent_heartbeat', $now, false);
                $modules = ['core', 'plugins', 'themes', 'security', 'forms', 'server', 'wordfence'];
                foreach ($modules as $mod) {
                    update_option('eoh_last_sent_' . $mod, $now, false);
                }
            }

            // Cache the RUM config returned by the dashboard so the front-end
            // tracking tag can be printed without an extra round-trip.
            $decoded = json_decode($body, true);
            if (is_array($decoded) && isset($decoded['rum']) && is_array($decoded['rum'])) {
                update_option('eoh_rum_config', [
                    'enabled'     => !empty($decoded['rum']['enabled']),
                    'tracking_id' => isset($decoded['rum']['tracking_id']) ? sanitize_text_field((string) $decoded['rum']['tracking_id']) : '',
                    'script_url'  => isset($decoded['rum']['script_url']) ? esc_url_raw((string) $decoded['rum']['script_url']) : '',
                ], false);
            }

            $this->store_sync_result(true, __('Sync completed successfully.', 'eye-of-horus-client'));
            return true;
        }

        /**
         * Print the Eye of Horus RUM tag in the site footer when collection is
         * enabled in the dashboard AND the site owner has not opted out locally.
         */
        public function maybe_print_rum_tag() {
            if (is_admin()) {
                return;
            }
            $cfg = get_option('eoh_rum_config', []);
            if (empty($cfg['enabled']) || empty($cfg['tracking_id']) || empty($cfg['script_url'])) {
                return;
            }
            $opts = wp_parse_args(get_option(self::OPTION_NAME, []), $this->default_settings());
            if (empty($opts['rum_consent'])) {
                return; // local opt-out
            }
            printf(
                '<script src="%s" data-eoh="%s" defer></script>' . "\n",
                esc_url($cfg['script_url']),
                esc_attr($cfg['tracking_id'])
            );
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
            register_rest_route('eye-of-horus/v1', '/sync', [
                'methods'             => 'POST',
                'callback'            => [$this, 'rest_trigger_sync'],
                'permission_callback' => '__return_true',
            ]);
        }

        public function rest_trigger_sync($request) {
            $settings    = get_option(self::OPTION_NAME, []);
            $stored_key  = isset($settings['site_key']) ? $settings['site_key'] : (isset($settings['api_key']) ? $settings['api_key'] : '');
            $provided_key = $request->get_header('X-EOH-KEY');

            if (empty($stored_key) || $provided_key !== $stored_key) {
                return new WP_Error('unauthorized', __('Invalid API key.', 'eye-of-horus-client'), ['status' => 401]);
            }

            $result = $this->sync_data(null, true);

            if (is_wp_error($result)) {
                return new WP_Error('sync_failed', $result->get_error_message(), ['status' => 500]);
            }

            return rest_ensure_response([
                'ok'      => true,
                'message' => __('Sync completed successfully.', 'eye-of-horus-client'),
            ]);
        }

        public function rest_update_plugin($request) {
            $settings    = get_option(self::OPTION_NAME, []);
            $stored_key  = isset($settings['site_key']) ? $settings['site_key'] : (isset($settings['api_key']) ? $settings['api_key'] : '');
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
