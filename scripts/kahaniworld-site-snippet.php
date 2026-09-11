add_action('wp', function () {
    if (!is_single() || get_post_type() !== 'post') {
        return;
    }

    $post_id = get_queried_object_id();
    if (!$post_id) {
        return;
    }

    $cookie = 'kw_viewed_' . $post_id;
    if (!isset($_COOKIE[$cookie])) {
        $views = (int) get_post_meta($post_id, 'kw_story_views', true);
        update_post_meta($post_id, 'kw_story_views', $views + 1);
        setcookie($cookie, '1', time() + 6 * HOUR_IN_SECONDS, COOKIEPATH ?: '/', COOKIE_DOMAIN, is_ssl(), true);
    }
});

function kw_story_views($post_id = null) {
    $post_id = $post_id ?: get_the_ID();
    return max(0, (int) get_post_meta($post_id, 'kw_story_views', true));
}

add_filter('the_content', function ($content) {
    if (!is_single() || get_post_type() !== 'post' || !in_the_loop() || !is_main_query()) {
        return $content;
    }

    $views = number_format_i18n(kw_story_views());
    $meta = '<div class="kw-story-meta"><span>👁 ' . esc_html($views) . ' views</span><span>नई कहानियां रोज रात 9 बजे</span></div>';

    return $meta . $content;
}, 12);

add_shortcode('kw_latest_stories', function ($atts) {
    $atts = shortcode_atts(['posts_per_page' => 8], $atts, 'kw_latest_stories');
    $paged = max(1, (int) (get_query_var('paged') ?: get_query_var('page') ?: 1));
    $query = new WP_Query([
        'post_type' => 'post',
        'post_status' => 'publish',
        'posts_per_page' => (int) $atts['posts_per_page'],
        'paged' => $paged,
        'ignore_sticky_posts' => true,
    ]);

    ob_start();
    echo '<div class="kw-story-list">';
    if ($query->have_posts()) {
        while ($query->have_posts()) {
            $query->the_post();
            $views = number_format_i18n(kw_story_views(get_the_ID()));
            echo '<article class="kw-story-card">';
            echo '<h2><a href="' . esc_url(get_permalink()) . '">' . esc_html(get_the_title()) . '</a></h2>';
            echo '<div class="kw-card-meta"><span>' . esc_html(get_the_date()) . '</span><span>👁 ' . esc_html($views) . '</span></div>';
            echo '<p>' . esc_html(wp_trim_words(get_the_excerpt() ?: wp_strip_all_tags(get_the_content()), 34, '...')) . '</p>';
            echo '<a class="kw-read-link" href="' . esc_url(get_permalink()) . '">पूरी कहानी पढ़ें</a>';
            echo '</article>';
        }
    } else {
        echo '<p class="kw-empty">अभी कोई कहानी उपलब्ध नहीं है.</p>';
    }
    echo '</div>';

    $links = paginate_links([
        'total' => max(1, (int) $query->max_num_pages),
        'current' => $paged,
        'type' => 'list',
        'prev_text' => '← Previous',
        'next_text' => 'Next →',
    ]);
    if ($links) {
        echo '<nav class="kw-pagination">' . $links . '</nav>';
    }
    wp_reset_postdata();

    return ob_get_clean();
});

add_shortcode('kw_popular_stories', function ($atts) {
    $atts = shortcode_atts(['posts_per_page' => 10], $atts, 'kw_popular_stories');

    $paged = max(1, (int) (get_query_var('paged') ?: get_query_var('page') ?: 1));

    $query = new WP_Query([
        'post_type' => 'post',
        'post_status' => 'publish',
        'posts_per_page' => (int) $atts['posts_per_page'],
        'paged' => $paged,
        'ignore_sticky_posts' => true,
        'meta_key' => 'kw_story_views',
        'orderby' => 'meta_value_num',
        'order' => 'DESC',
    ]);

    ob_start();

    echo '<div class="kw-story-list">';

    if ($query->have_posts()) {
        while ($query->have_posts()) {
            $query->the_post();

            $views = number_format_i18n(kw_story_views(get_the_ID()));

            echo '<article class="kw-story-card">';
            echo '<h2><a href="' . esc_url(get_permalink()) . '">' . esc_html(get_the_title()) . '</a></h2>';
            echo '<div class="kw-card-meta">';
            echo '<span>' . esc_html(get_the_date()) . '</span>';
            echo '<span>👁 ' . esc_html($views) . ' views</span>';
            echo '</div>';
            echo '<p>' . esc_html(wp_trim_words(get_the_excerpt() ?: wp_strip_all_tags(get_the_content()), 34, '...')) . '</p>';
            echo '<a class="kw-read-link" href="' . esc_url(get_permalink()) . '">पूरी कहानी पढ़ें</a>';
            echo '</article>';
        }
    } else {
        echo '<p class="kw-empty">अभी कोई कहानी उपलब्ध नहीं है।</p>';
    }

    echo '</div>';

    $links = paginate_links([
        'total' => max(1, (int) $query->max_num_pages),
        'current' => $paged,
        'type' => 'list',
        'prev_text' => '← Previous',
        'next_text' => 'Next →',
    ]);

    if ($links) {
        echo '<nav class="kw-pagination">' . $links . '</nav>';
    }

    wp_reset_postdata();

    return ob_get_clean();
});

add_filter('the_excerpt', function ($excerpt) {
    if (!is_category() || !in_the_loop() || !is_main_query()) {
        return $excerpt;
    }

    if (strpos($excerpt, 'class="read-more"') !== false) {
        return $excerpt;
    }

    return $excerpt
        . '<p class="kw-archive-read">'
        . '<a href="' . esc_url(get_permalink()) . '">पूरी कहानी पढ़ें</a>'
        . '</p>';
}, 20);

add_action('wp_head', function () {
    ?>
    <style id="kahaniworld-design-system">
        :root {
            --kw-bg: #ddd4b8;
            --kw-surface: #fffaf0;
            --kw-card: #fff9df;
            --kw-text: #21180f;
            --kw-muted: #6e5b43;
            --kw-border: #e4d6ad;
            --kw-brand: #0f6173;
            --kw-brand-dark: #084858;
            --kw-accent: #843f08;
            --kw-link: #85440b;
        }
        html.kw-night {
            --kw-bg: #171411;
            --kw-surface: #221d18;
            --kw-card: #2b241d;
            --kw-text: #f4ead6;
            --kw-muted: #cdbb9f;
            --kw-border: #4a3929;
            --kw-brand: #2f9ab2;
            --kw-brand-dark: #8edbea;
            --kw-accent: #c47a2c;
            --kw-link: #f0a64b;
        }
        body {
            background: var(--kw-bg) !important;
            color: var(--kw-text);
            font-family: Arial, "Noto Sans Devanagari", Mangal, sans-serif;
        }
        a { color: var(--kw-link); }
        .site-header, .main-navigation {
            background: var(--kw-surface) !important;
        }
        .site-footer, .site-info { display: none !important; }
        .site-branding, .inside-header, .inside-navigation, .site-content, .inside-site-info {
            max-width: 1060px;
        }
        .site-header .inside-header {
            padding: 16px 14px 14px !important;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 14px;
        }
        .site-branding { padding: 0 !important; }
        .main-title a, .site-branding .main-title a {
            color: var(--kw-brand-dark) !important;
            font-weight: 800;
            letter-spacing: 0;
        }
        .main-navigation {
            background: var(--kw-brand) !important;
            border: 0;
        }
        .main-navigation .main-nav ul li a {
            color: #fff !important;
            font-weight: 700;
        }
        .main-navigation .main-nav ul li:hover > a,
        .main-navigation .main-nav ul li.current-menu-item > a {
            background: rgba(0,0,0,.16) !important;
            color: #fff !important;
        }
        .site-content {
            background: var(--kw-surface);
            padding: 18px 16px !important;
            margin-top: 0;
            margin-bottom: 0;
        }
        body.home .site-content {
            padding: 0 !important;
            background: var(--kw-surface);
        }
        body.home .inside-article {
            padding: 0 !important;
            border: 0 !important;
            background: transparent !important;
        }
        .inside-article, .sidebar .widget {
            background: var(--kw-card) !important;
            border: 1px solid var(--kw-border);
            box-shadow: none;
        }
        .entry-title, .entry-title a {
            color: var(--kw-brand-dark) !important;
            line-height: 1.28;
        }
        .entry-meta, .entry-meta a {
            color: var(--kw-muted) !important;
        }
        .kw-home {
            max-width: 980px;
            margin: 0 auto;
            padding: 18px 14px 26px;
            color: var(--kw-text);
        }
        .kw-hero {
            background: linear-gradient(180deg, var(--kw-card), var(--kw-surface));
            border: 1px solid var(--kw-border);
            border-top: 6px solid var(--kw-brand);
            padding: 18px 16px 16px;
            margin: 0 0 16px;
        }
        .kw-hero h1 {
            color: var(--kw-brand-dark);
            font-size: 30px;
            line-height: 1.22;
            margin: 0 0 8px;
            font-weight: 800;
        }
        .kw-hero p {
            color: var(--kw-muted);
            font-size: 16px;
            line-height: 1.65;
            margin: 0;
        }
        .kw-quick {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            margin: 14px 0 22px;
        }
        .kw-btn, .kw-read-link {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            background: var(--kw-accent);
            color: #fff !important;
            border-radius: 4px;
            padding: 11px 12px;
            font-weight: 800;
            text-decoration: none;
        }
        .kw-btn.alt { background: #25201a; }
        html.kw-night .kw-btn.alt { background: #3b332b; }
        .kw-section-title {
            color: var(--kw-brand-dark);
            font-size: 22px;
            margin: 24px 0 12px;
            line-height: 1.3;
        }
        .kw-chip-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            margin-bottom: 20px;
        }
        .kw-category-panel {
            margin: 0 0 20px;
        }
        .kw-category-panel > summary {
            display: none;
            cursor: pointer;
            background: var(--kw-brand);
            color: #fff;
            padding: 12px 14px;
            border-radius: 4px;
            font-weight: 800;
        }
        .kw-chip {
            display: block;
            background: var(--kw-card);
            border: 1px solid var(--kw-border);
            border-radius: 4px;
            color: var(--kw-text) !important;
            font-weight: 800;
            padding: 12px;
            text-decoration: none;
        }
        .kw-story-list {
            display: grid;
            gap: 14px;
            margin: 0;
        }
        .kw-story-card {
            background: var(--kw-card);
            border: 1px solid var(--kw-border);
            border-left: 5px solid var(--kw-accent);
            padding: 15px 14px;
        }
        .kw-story-card h2 {
            font-size: 21px;
            line-height: 1.34;
            margin: 0 0 8px;
        }
        .kw-story-card h2 a {
            color: var(--kw-brand-dark);
            text-decoration: none;
        }
        .kw-card-meta, .kw-story-meta {
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
            color: var(--kw-muted);
            font-size: 13px;
            margin: 0 0 10px;
        }
        .kw-story-card p {
            font-size: 15px;
            line-height: 1.62;
            margin: 0 0 12px;
            color: var(--kw-text);
        }

        /* Category archive card layout */
body.category .site-main {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
}

body.category .site-main > .page-header {
    grid-column: 1 / -1;
}

body.category .site-main > article {
    background: var(--kw-card);
    border: 1px solid var(--kw-border);
    border-left: 5px solid var(--kw-accent);
    padding: 15px 14px;
    margin: 0;
}

body.category .site-main > article .inside-article {
    padding: 0;
}

body.category .site-main > article .entry-title {
    font-size: 21px;
    line-height: 1.34;
    margin: 0 0 8px;
}

body.category .site-main > article .entry-title a {
    color: var(--kw-brand-dark);
    text-decoration: none;
}

body.category .site-main > article .entry-meta {
    color: var(--kw-muted);
    font-size: 13px;
}

body.category .site-main > article .entry-summary {
    font-size: 15px;
    line-height: 1.62;
    margin: 0 0 12px;
    color: var(--kw-text);
}

body.category .site-main > article .entry-summary p {
    margin: 0;
}

body.category .site-main > article footer.entry-meta {
    border-top: 1px solid var(--kw-border);
    padding-top: 9px;
    margin-top: 10px;
}

body.category .site-main > article footer.entry-meta a {
    color: var(--kw-accent);
}

@media (max-width: 700px) {
    body.category .site-main {
        grid-template-columns: 1fr;
    }
}
body.category .site-main > article .inside-article {
    background: transparent;
    border: 0;
    box-shadow: none;
    padding: 0;
}

body.category .site-main > article .entry-header,
body.category .site-main > article .entry-summary,
body.category .site-main > article footer.entry-meta {
    background: transparent;
}


body.category .kw-archive-read {
    margin: 12px 0 0;
}

body.category .kw-archive-read a {
    display: inline-block;
    background: var(--kw-accent);
    color: #fff;
    text-decoration: none;
    padding: 8px 12px;
    border-radius: 4px;
    font-weight: 600;
}

body.category .kw-archive-read a:hover {
    opacity: 0.9;
}
        
        .kw-pagination ul {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            list-style: none;
            margin: 22px 0 0;
            padding: 0;
        }
        .kw-pagination a, .kw-pagination span {
            display: block;
            background: var(--kw-card);
            border: 1px solid var(--kw-border);
            color: var(--kw-text);
            padding: 9px 12px;
            text-decoration: none;
            border-radius: 4px;
            font-weight: 700;
        }
        .kw-pagination .current {
            background: var(--kw-brand);
            color: #fff;
        }
        .kw-story-meta {
            background: var(--kw-card);
            border: 1px solid var(--kw-border);
            padding: 10px 12px;
            margin-bottom: 16px;
        }
        .kw-story-post {
            max-width: 760px;
            margin: 0 auto;
            color: var(--kw-text);
            font-family: Arial, "Noto Sans Devanagari", Mangal, sans-serif;
            font-size: 16px;
            line-height: 1.72;
        }
        .kw-story-post p {
            margin: 0 0 1.05em;
            color: var(--kw-text);
            font-size: 16px;
            line-height: 1.72;
            word-break: normal;
            overflow-wrap: normal;
            text-align: left;
        }
        .kw-story-post .kw-story-body {
            padding: 4px 0 8px;
        }
        .kw-story-post .kw-story-links {
            margin-top: 28px;
            padding: 16px;
            border: 1px solid var(--kw-border);
            background: var(--kw-card);
            font-size: 15px;
            line-height: 1.7;
        }
        .kw-story-post .kw-story-links strong {
            display: block;
            margin-bottom: 8px;
            color: var(--kw-brand-dark);
        }
        .kw-story-post .kw-story-links a {
            color: var(--kw-link);
            font-weight: 700;
        }
        .kw-footer {
            background: #10495a;
            margin-top: 0;
            padding: 30px 16px 84px;
            color: #fff;
        }
        .kw-footer-inner {
            max-width: 1060px;
            margin: 0 auto;
            display: grid;
            gap: 18px;
        }
        .kw-footer h3 {
            margin: 0 0 8px;
            color: #fff;
            font-size: 18px;
        }
        .kw-footer p, .kw-footer a {
            color: #f4ead6;
            font-size: 14px;
            line-height: 1.6;
        }
        .kw-footer-links {
            display: flex;
            flex-wrap: wrap;
            gap: 10px 16px;
        }
        .kw-footer-bottom {
            max-width: 1060px;
            margin: 22px auto 0;
            padding-top: 16px;
            border-top: 1px solid rgba(255,255,255,.18);
            color: #fff;
            text-align: center;
            font-size: 13px;
        }
        #kw-night-toggle {
            position: fixed;
            right: 16px;
            bottom: 16px;
            z-index: 9999;
            width: 52px;
            height: 42px;
            border: 0;
            border-radius: 999px;
            background: #2a251f;
            color: #fff;
            box-shadow: 0 6px 18px rgba(0,0,0,.25);
            cursor: pointer;
            font-size: 18px;
        }
        @media (max-width: 760px) {
            .site-content {
                margin-top: 0;
                padding: 12px 10px !important;
            }
            .site-header .inside-header {
                padding: 12px 12px !important;
                justify-content: center;
            }
            .site-branding { text-align: center; }
            .main-title { font-size: 28px; }
            .main-navigation .menu-toggle {
                color: #fff !important;
                font-weight: 700;
            }
            .kw-home { padding: 12px 10px 22px; }
            .kw-hero h1 { font-size: 27px; }
            .kw-category-panel > summary { display: block; }
            .kw-category-panel:not([open]) .kw-chip-grid { display: none; }
            .kw-chip-grid { grid-template-columns: 1fr; margin-top: 10px; }
            .kw-quick { grid-template-columns: 1fr 1fr; }
            .kw-story-card h2 { font-size: 20px; }
        }
        @media (min-width: 820px) {
            .kw-story-list { grid-template-columns: 1fr 1fr; }
            .kw-chip-grid { grid-template-columns: repeat(3,1fr); }
            .kw-footer-inner { grid-template-columns: 1.2fr 1fr 1fr; }
        }
    </style>
    <script>
        (function () {
            try {
                if (localStorage.getItem('kwNightMode') === '1') {
                    document.documentElement.classList.add('kw-night');
                }
            } catch (e) {}
        })();
    </script>
    <?php
});

add_action('wp_footer', function () {
    ?>
    <footer class="kw-footer" role="contentinfo">
        <div class="kw-footer-inner">
            <section>
                <h3>Kahani World</h3>
                <p>Hindi adult stories, desi kahani, village stories aur long multi-part series ke liye mobile-first reading site.</p>
            </section>
            <section>
                <h3>Explore</h3>
                <div class="kw-footer-links">
                    <a href="/new-stories/">New Stories</a>
                    <a href="/most-popular-stories/">Most Popular</a>
                    <a href="/category/hindi-adult-stories/">Hindi Stories</a>
                    <a href="/category/desi-stories/">Desi Stories</a>
                    <a href="/category/village-stories/">Village Stories</a>
                </div>
            </section>
            <section>
                <h3>Business</h3>
                <div class="kw-footer-links">
                    <a href="/contact/">Contact</a>
                    <a href="/advertise/">Advertise</a>
                    <a href="/privacy-policy/">Privacy Policy</a>
                </div>
            </section>
        </div>
        <div class="kw-footer-bottom">© <?php echo esc_html(date('Y')); ?> Kahani World</div>
    </footer>
    <button id="kw-night-toggle" type="button" aria-label="Toggle night mode">☾</button>
    <script>
        (function () {
            var button = document.getElementById('kw-night-toggle');
            if (!button) return;
            function sync() {
                button.textContent = document.documentElement.classList.contains('kw-night') ? '☀' : '☾';
            }
            sync();
            button.addEventListener('click', function () {
                document.documentElement.classList.toggle('kw-night');
                try {
                    localStorage.setItem('kwNightMode', document.documentElement.classList.contains('kw-night') ? '1' : '0');
                } catch (e) {}
                sync();
            });
        })();
    </script>
    <?php
}, 99);
