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

    // Keep tracking story views internally, but do not expose counts to visitors.
    $meta = '<div class="kw-story-meta"><span>Kahani World story</span></div>';

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
            echo '<article class="kw-story-card">';
            echo '<h2><a href="' . esc_url(get_permalink()) . '">' . esc_html(get_the_title()) . '</a></h2>';
            echo '<div class="kw-card-meta"><span>' . esc_html(get_the_date()) . '</span></div>';
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

            echo '<article class="kw-story-card">';
            echo '<h2><a href="' . esc_url(get_permalink()) . '">' . esc_html(get_the_title()) . '</a></h2>';
            echo '<div class="kw-card-meta">';
            echo '<span>' . esc_html(get_the_date()) . '</span>';
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
body.category .kw-archive-views {
            margin-left: 8px;
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
        /* Desktop: use the available screen width instead of leaving a large empty sidebar gutter. */
        @media (min-width: 761px) {
            .grid-container { max-width: 1320px !important; }
            .site-content { max-width: 1320px !important; width: 100%; box-sizing: border-box; }
            .site-content .content-area,
            #primary.content-area { width: 100% !important; max-width: 100% !important; float: none !important; }
            #right-sidebar, #left-sidebar { display: none !important; }
            .site-content { display: block !important; }
            body.home .kw-home { max-width: 1120px; padding-left: 24px; padding-right: 24px; }
            body.category .site-main { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
            body.category .site-content { padding: 24px 28px !important; }
            .kw-story-list { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
            .kw-story-card { min-width: 0; }
            .kw-footer-inner { max-width: 1120px; }
        }
        /* Keep the desktop navigation on one line where possible and allow a clean wrap on smaller desktops. */
        @media (min-width: 761px) {
            .main-navigation .inside-navigation { display: flex; align-items: center; }
            .main-navigation .main-nav { flex: 1 1 auto; min-width: 0; }
            .main-navigation .main-nav > ul { display: flex; flex-wrap: wrap; align-items: center; }
            .main-navigation .main-nav > ul > li { flex: 0 0 auto; }
            .main-navigation .main-nav > ul > li > a { padding-left: 11px; padding-right: 11px; white-space: normal; line-height: 1.35; }
        }
        /* Hide legacy counter output as a safety net; actual view metadata is retained. */
        .kw-archive-views, .kw-story-views, .kw-card-meta .view-count, .post-views, .views-count { display: none !important; }
        .kw-legal .kw-story-card { line-height: 1.7; }
        .kw-legal .kw-story-card h2 { color: var(--kw-brand-dark); margin-top: 22px; }
        .kw-legal .kw-story-card h2:first-child { margin-top: 0; }
        .kw-legal .kw-story-card ul { padding-left: 22px; }
        .kw-legal .kw-story-card li { margin-bottom: 8px; }
        .kw-legal .kw-story-card a { overflow-wrap: anywhere; }
        @media (max-width: 760px) {
            .main-navigation .main-nav > ul > li > a { white-space: normal; }
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
                 <p>Hindi sex story aur adult kahani ka roz badhta collection: bhabhi, aunty, padosan, village aur real stories, multi-part series ke saath.</p>
    <p>Kahani World ki sabhi kahaniyon ke paatr adult hain. Yahan ki kahaniyan sirf manoranjan ke liye hain, aur sirf 18+ readers ke liye.</p>
            </section>
            <section>
                <h3>Explore</h3>
                <div class="kw-footer-links">
                    <a href="/new-stories/">New Sex Stories</a>
                    <a href="/most-popular-stories/">Most Popular Sex Stories</a>
                    <a href="/category/hindi-adult-stories/">Hindi Adult Stories</a>
                    <a href="/category/desi-stories/">Desi Sex Stories</a>
                    <a href="/category/village-stories/">Village Sex Stories</a>
                    <a href="/category/real-stories/">Real Sex Stories</a>
                    <a href="/category/romantic-stories/">Romantic Sex Stories</a>
                    <a href="/category/hindi-sex-story/">Hindi Sex Stories</a>
                    <a href="/category/bhabhi-sex-story/">Bhabhi Sex Story</a>
                </div>
            </section>
            <section>
                <h3>Business</h3>
                <div class="kw-footer-links">
                    <a href="/about/">About</a>
                    <a href="/contact/">Contact</a>
                    <a href="/advertise/">Advertise</a>
                    <a href="/privacy-policy/">Privacy Policy</a>
                    <a href="/cookies-policy/">Cookies Policy</a>
                    <a href="/terms-of-use/">Terms of Use</a>
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

add_filter('generate_comments_title_output', function ($output, $comments_title, $comments_number) {
    return '<h3 class="comments-title">Comments</h3>';
}, 10, 3);
/* View counts remain stored internally for sorting/analytics, but are hidden from visitors. */


/* Show story tags directly after the story content */
// add_action('generate_after_entry_content', function () {
//     if (!is_singular('post')) {
//         return;
//     }

//     $tags = get_the_tags(get_queried_object_id());

//     if (empty($tags) || is_wp_error($tags)) {
//         return;
//     }

//     echo '<div class="kw-story-tags">';
//     echo '<strong>Tags:</strong> ';

//     $links = [];

//     foreach ($tags as $tag) {
//         $links[] = '<a href="' .
//             esc_url(get_tag_link($tag->term_id)) . '">' .
//             esc_html($tag->name) .
//             '</a>';
//     }

//     echo implode(', ', $links);
//     echo '</div>';
// }, 20);

/* Hide only the original duplicate tag list */
add_action('wp_head', function () {
    if (!is_singular('post')) {
        return;
    }
    ?>
    <style>
        body.single-post footer.entry-meta .tags-links {
            display: none !important;
        }

        .kw-story-tags {
            margin: 18px 0 24px;
            padding: 12px 14px;
            border: 1px solid var(--kw-border);
            background: var(--kw-card);
            color: var(--kw-text);
            line-height: 1.8;
        }

        .kw-story-tags strong {
            color: var(--kw-brand-dark);
            margin-right: 6px;
        }

        .kw-story-tags a {
            color: var(--kw-link);
        }
    </style>
    <?php
}, 99);


/* Insert story tags immediately after the related-story links */
add_filter('the_content', function ($content) {
    if (!is_singular('post') || !in_the_loop() || !is_main_query()) {
        return $content;
    }
    $content = str_replace(
    '<strong>और कहानियां पढ़ें</strong>',
    '<strong>Related Stories</strong>',
    $content
);

    $post_id = get_queried_object_id();
    $tags = get_the_tags($post_id);

    if (empty($tags) || is_wp_error($tags)) {
        return $content;
    }

    $links = [];

    foreach ($tags as $tag) {
        $links[] = '<a href="' .
            esc_url(get_tag_link($tag->term_id)) . '">' .
            esc_html($tag->name) .
            '</a>';
    }

    $tag_html = '<div class="kw-story-tags"><strong>Tags:</strong> ' .
        implode(', ', $links) .
        '</div>';

    $related_pos = strpos($content, '<nav class="kw-story-links">');

if ($related_pos !== false) {
    return substr($content, 0, $related_pos) .
        $tag_html .
        substr($content, $related_pos);
}

$closing = strrpos($content, '</article>');

if ($closing !== false) {
    return substr($content, 0, $closing) .
        $tag_html .
        substr($content, $closing);
}

    return $content . $tag_html;
}, 20);



/* Manually curated Best Stories list */
add_filter('the_content', function ($content) {
    if (!is_singular('post') || !in_the_loop() || !is_main_query()) {
        return $content;
    }

    // Keep the first 10 as your preferred editorial order.
    // The extra slugs are backups if a story is missing or is the current post.
    $best_story_slugs = [
        'village-hindi-story-vidhwa-chachi',
        'sautan-doodhwala-hindi-sex-story',
        'delivery-boy-rajat-burka-wife-sex-story',
        'gaon-charwaha-kalua-chachi-anokha-raaz',
        'bhatiji-uski-saheli-ki-chudai-adult-hindi-story',
        'chachi-ki-suhagraat-village-sex-story',
        'sexy-wife-ki-real-kahani',
        'hindi-sex-stories-cuck-threesome',
        'hot-adult-story-neha-ki-garam-choot-ki-aag',
        'muslim-girl-sara-fucking-story',
        'real-sex-story-naina-ki-namkin-choot',

        // Backup stories
        'hot-bhabhi-ki-sex-story',
        'desi-hindi-story-barish-ki-raat-ayesha',
        'jungle-me-pahli-chudai-hindi-sex-story',
    ];

    $current_post_id = get_queried_object_id();
    $items = [];
    $seen_ids = [];

    foreach ($best_story_slugs as $slug) {
        if (count($items) >= 10) {
            break;
        }

        $post = get_page_by_path($slug, OBJECT, 'post');

        if (
            !$post ||
            $post->post_status !== 'publish' ||
            (int) $post->ID === (int) $current_post_id ||
            in_array((int) $post->ID, $seen_ids, true)
        ) {
            continue;
        }

        $seen_ids[] = (int) $post->ID;

        $items[] = '<li><a href="' .
            esc_url(get_permalink($post->ID)) . '">' .
            esc_html(get_the_title($post->ID)) .
            '</a></li>';
    }

    if (empty($items)) {
        return $content;
    }

    $best_html = '<section class="kw-best-stories">';
    $best_html .= '<h2>Top 10 Stories on Kahani World</h2><ol>';
    $best_html .= implode('', $items);
    $best_html .= '</ol></section>';

    // Insert after the related-story links, before the closing article.
    $closing = strrpos($content, '</article>');

    if ($closing !== false) {
        return substr($content, 0, $closing) .
            $best_html .
            substr($content, $closing);
    }

    return $content . $best_html;
}, 30);

/* Best Stories styling */
add_action('wp_head', function () {
    if (!is_singular('post')) {
        return;
    }
    ?>
    <style>
        .kw-best-stories {
            margin: 24px 0;
            padding: 16px;
            border: 1px solid var(--kw-border);
            background: var(--kw-card);
            color: var(--kw-text);
            line-height: 1.8;
        }

        /* .kw-best-stories h2 {
            margin: 0 0 10px;
            color: var(--kw-brand-dark);
            font-size: 15px;
            font-weight: 700;
            line-height: 1.8;
        } */
            .kw-best-stories h2 {
    margin: 0 0 10px !important;
    padding: 0 !important;
    color: var(--kw-brand-dark) !important;
    font-size: 15px !important;
    font-weight: 700 !important;
    line-height: 1.8 !important;
    text-decoration: none !important;
    border: 0 !important;
    box-shadow: none !important;
}

        .kw-best-stories ol {
            margin: 0;
            padding-left: 24px;
        }

        .kw-best-stories li {
            margin-bottom: 6px;
        }

        .kw-best-stories a {
            color: var(--kw-link);
            font-weight: 600;
        }

        

.kw-story-tags strong,
.kw-story-links > strong,
.kw-best-stories h2 {
    font-family: inherit !important;
    font-size: 15px !important;
    font-weight: 700 !important;
    line-height: 1.8 !important;
    text-decoration: none !important;
    border-bottom: none !important;
    box-shadow: none !important;
    background-image: none !important;
}

/* Remove underlines from section headings, not story links */
.kw-story-tags strong a,
.kw-story-links > strong a,
.kw-best-stories h2 a {
    text-decoration: none !important;
    border-bottom: none !important;
    box-shadow: none !important;
}
.kw-story-tags,
.kw-story-links,
.kw-best-stories {
    text-decoration: none !important;
}


/* Remove underlines from links in these three story sections */
body.single-post .kw-story-tags a,
body.single-post .kw-story-links a,
body.single-post .kw-best-stories a {
    text-decoration: none !important;
    border-bottom: 0 !important;
    box-shadow: none !important;
    background-image: none !important;
}

/* Keep links clean when hovered or focused too */
body.single-post .kw-story-tags a:hover,
body.single-post .kw-story-links a:hover,
body.single-post .kw-best-stories a:hover,
body.single-post .kw-story-tags a:focus,
body.single-post .kw-story-links a:focus,
body.single-post .kw-best-stories a:focus {
    text-decoration: none !important;
    border-bottom: 0 !important;
    box-shadow: none !important;
    background-image: none !important;
}


    </style>
    <?php
}, 99);


/* KahaniWorld: custom Previous/Next Story navigation */
add_action('generate_after_entry_content', function () {
    if (!is_singular('post')) {
        return;
    }

    $previous = get_previous_post();
    $next = get_next_post();

    if (!$previous && !$next) {
        return;
    }

    echo '<nav class="kw-story-navigation" aria-label="Story navigation">';

    if ($previous) {
        echo '<a class="kw-previous-story" href="' .
            esc_url(get_permalink($previous->ID)) . '">' .
            '<span>← Previous Story</span>' .
            '<strong>' . esc_html(get_the_title($previous->ID)) . '</strong>' .
            '</a>';
    }

    if ($next) {
        echo '<a class="kw-next-story" href="' .
            esc_url(get_permalink($next->ID)) . '">' .
            '<span>Next Story →</span>' .
            '<strong>' . esc_html(get_the_title($next->ID)) . '</strong>' .
            '</a>';
    }

    echo '</nav>';
}, 30);


/* KahaniWorld: navigation, category links and footer styling */
add_action('wp_head', function () {
    if (!is_singular('post')) {
        return;
    }
    ?>
    <style>
        /* Hide GeneratePress's original navigation */
        body.single-post footer.entry-meta nav#nav-below.post-navigation {
            display: none !important;
        }

        /* Custom Previous/Next Story cards */
        body.single-post .kw-story-navigation {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 12px;
            margin: 32px 0 24px;
        }

        body.single-post .kw-story-navigation a {
            display: flex;
            flex-direction: column;
            gap: 6px;
            min-width: 0;
            padding: 12px;
            background: var(--kw-card);
            border: 1px solid var(--kw-border);
            border-left: 4px solid var(--kw-accent);
            color: var(--kw-link);
            line-height: 1.6;
            text-decoration: none !important;
            overflow-wrap: anywhere;
            box-sizing: border-box;
        }

        body.single-post .kw-story-navigation .kw-next-story {
            border-left: 1px solid var(--kw-border);
            border-right: 4px solid var(--kw-accent);
            text-align: right;
        }

        body.single-post .kw-story-navigation a span {
            color: var(--kw-brand-dark) !important;
            font-size: 14px;
            font-weight: 700;
        }

        body.single-post .kw-story-navigation a strong {
            color: var(--kw-link);
            font-size: 14px;
            font-weight: 600;
        }

        body.single-post .kw-story-navigation a:hover {
            border-color: var(--kw-brand);
        }

        /* Related categories: brown links with underlines */
        body.single-post .kw-seo-links,
        body.single-post .kw-seo-links strong {
            color: #24201b !important;
        }

        body.single-post .kw-seo-links a {
            color: var(--kw-link) !important;
            text-decoration: underline !important;
            border: 0 !important;
            box-shadow: none !important;
            background-image: none !important;
        }

        /* Remove redundant folder-icon category metadata */
        body.single-post footer.entry-meta .cat-links {
            display: none !important;
        }

        @media (max-width: 480px) {
            body.single-post .kw-story-navigation {
                gap: 8px;
            }

            body.single-post .kw-story-navigation a {
                padding: 10px;
            }
        }
    </style>
    <?php
}, 99);
