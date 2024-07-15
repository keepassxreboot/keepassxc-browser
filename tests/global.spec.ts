import { test, expect } from '@playwright/test';
import {
    siteMatch,
    slashNeededForUrl,
    trimURL
} from '../keepassxc-browser/common/global.js';

test('Test siteMatch()', async ({ page }) => {
    expect(siteMatch('https://example.com/*', 'https://example.com/login_page')).toBe(true);
    expect(siteMatch('https://*.lexample.com/*', 'https://example.com/login_page')).toBe(false);
    expect(siteMatch('https://example.com/*', 'https://example2.com/login_page')).toBe(false);
    expect(siteMatch('https://example.com/*', 'https://subdomain.example.com/login_page')).toBe(false);
    expect(siteMatch('https://example.com', 'https://subdomain.example.com/login_page')).toBe(false);
    expect(siteMatch('https://*.example.com/*', 'https://example.com/login_page')).toBe(true);
    expect(siteMatch('https://*.example.com/*', 'https://test.example.com/login_page')).toBe(true);
    expect(siteMatch('https://test.example.com/*', 'https://subdomain.example.com/login_page')).toBe(false);
    expect(siteMatch('https://test.example.com/page/*', 'https://test.example.com/page/login_page')).toBe(true);
    expect(siteMatch('https://test.example.com/page/*', 'https://test.example.com/page/login_page?dontcare=aboutme')).toBe(true);
    expect(siteMatch('https://test.example.com/page/another_page/*', 'https://test.example.com/page/login')).toBe(false);
    expect(siteMatch('https://test.example.com/path/another/a/', 'https://test.example.com/path/another/a/')).toBe(true);
    expect(siteMatch('https://test.example.com/path/another/a/', 'https://test.example.com/path/another/b/')).toBe(false);
    expect(siteMatch('https://test.example.com/*/another/a/', 'https://test.example.com/path/another/a/')).toBe(true);
    expect(siteMatch('https://test.example.com/path/*/a/', 'https://test.example.com/path/another/a/')).toBe(true);
    expect(siteMatch('https://test.example.com/path2/*/a/', 'https://test.example.com/path/another/a/')).toBe(false);
    expect(siteMatch('https://example.com:8448/', 'https://example.com/')).toBe(false);
    expect(siteMatch('https://example.com:8448/', 'https://example.com:8448/')).toBe(true);
    expect(siteMatch('https://example.com:8448/login/page', 'https://example.com/login/page')).toBe(false);
    expect(siteMatch('https://example.com:8448/*', 'https://example.com:8448/login/page')).toBe(true);
    expect(siteMatch('https://example.com/$/*', 'https://example.com/$/login_page')).toBe(true); // Special character in URL
    expect(siteMatch('https://example.com/*/*', 'https://example.com/$/login_page')).toBe(true);
    expect(siteMatch('https://example.com/*/*', 'https://example.com/login_page')).toBe(false);
    expect(siteMatch('https://*.com/*', 'https://example.com/$/login_page')).toBe(true);
    expect(siteMatch('https://*.com/*', 'https://example.org/$/login_page')).toBe(false);
    expect(siteMatch('https://*.*/*', 'https://example.org/$/login_page')).toBe(true);

    // IP based URL's
    expect(siteMatch('https://127.128.129.130:8448/', 'https://127.128.129.130:8448/')).toBe(true);
    expect(siteMatch('https://127.128.129.*:8448/', 'https://127.128.129.130:8448/')).toBe(true);
    expect(siteMatch('https://127.128.*/', 'https://127.128.129.130/')).toBe(true);
    expect(siteMatch('https://127.128.*/', 'https://127.1.129.130/')).toBe(false);
    expect(siteMatch('https://127.128.129.130/', 'https://127.128.129.130:8448/')).toBe(true);
    expect(siteMatch('https://127.128.129.*/', 'https://127.128.129.130:8448/')).toBe(true);

    // Invalid URL's
    expect(siteMatch('', 'https://example.com')).toBe(false);
    expect(siteMatch('abcdefgetc', 'https://example.com')).toBe(false);
    expect(siteMatch('{TOTP}\\no', 'https://example.com')).toBe(false);
    expect(siteMatch('https://320.320.320.320', 'https://example.com')).toBe(false);
});

test('Test slashNeededForUrl()', async ({ page }) => {
    expect(slashNeededForUrl('https://test.com')).not.toBe(null);
    expect(slashNeededForUrl('https://test.com/')).toBe(null);
});

test('Test trimURL()', async ({ page }) => {
    expect(trimURL('https://example.com/path/?login=yes&fallback=no')).toBe('https://example.com/path/');
    expect(trimURL('https://example.com/path/?login=yes')).toBe('https://example.com/path/');
    expect(trimURL('https://example.com/path/')).toBe('https://example.com/path/');
    expect(trimURL('https://example.com/path/#extra')).toBe('https://example.com/path/#extra');
});
