import { test, expect } from '@playwright/test';
//import { getBaseDomainFromUrl, getTopLevelDomainFromUrl } from '../keepassxc-browser/background/page.js';

test.skip('Test getTopLevelDomainFromUrl()', async ({ page }) => {
    // TODO: Enable these tests later. Not sure how to tests cookies API which requires to be running in the
    //       background script.
    // Top-Level-Domain tests
    /*const tldUrls = [
        [ 'another.example.co.uk', 'co.uk' ],
        [ 'www.example.com', 'com' ],
        [ 'github.com', 'com' ],
        [ 'test.net', 'net' ],
        [ 'so.many.subdomains.co.jp', 'co.jp' ],
        [ '192.168.0.1', '192.168.0.1' ],
        [ 'www.nic.ar','ar' ],
        [ 'no.no.no', 'no' ],
        [ 'www.blogspot.com.ar', 'blogspot.com.ar' ], // blogspot.com.ar is a TLD
        [ 'jap.an.ide.kyoto.jp', 'ide.kyoto.jp' ], // ide.kyoto.jp is a TLD
    ];

    for (const d of tldUrls) {
        //kpxcAssert(page.getTopLevelDomainFromUrl(d[0]), d[1], testCard, 'getTopLevelDomainFromUrl() for ' + d[0]);
        expect(getTopLevelDomainFromUrl(d[0], 'https://' + d[0])).toBe(d[2]);
    }

    // Base domain tests
    const domains = [
        [ 'another.example.co.uk', 'example.co.uk' ],
        [ 'www.example.com', 'example.com' ],
        [ 'test.net', 'test.net' ],
        [ 'so.many.subdomains.co.jp', 'subdomains.co.jp' ],
        [ '192.168.0.1', '192.168.0.1' ],
        [ 'www.nic.ar', 'nic.ar' ],
        [ 'www.blogspot.com.ar', 'www.blogspot.com.ar' ], // blogspot.com.ar is a TLD
        [ 'www.arpa', 'www.arpa' ],
        [ 'jap.an.ide.kyoto.jp', 'an.ide.kyoto.jp' ], // ide.kyoto.jp is a TLD
        [ 'kobe.jp', 'kobe.jp' ],
    ];

    for (const d of domains) {
        //kpxcAssert(page.getBaseDomainFromUrl(d[0]), d[1], testCard, 'getBaseDomainFromUrl() for ' + d[0]);
        expect(getBaseDomainFromUrl(d[0], 'https://' + d[0])).toBe(d[1]);
    }*/
});
