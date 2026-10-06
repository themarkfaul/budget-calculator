// Adds any newly announced Social Security wage base to js/tax-limits.js.
// Source: SSA's yearly "Cost-of-Living Increase and Other Determinations" notice
// in the Federal Register (ssa.gov blocks automated requests; this API does not).
// Exits with an error in January if the new year's limit still hasn't been found,
// so GitHub emails the repo owner.
const fs = require('fs');
const path = require('path');

const LIMITS_FILE = path.join(__dirname, '..', '..', 'js', 'tax-limits.js');
const SEARCH_URL = 'https://www.federalregister.gov/api/v1/documents.json' +
    '?conditions[term]=%22Cost-of-Living+Increase+and+Other+Determinations%22' +
    '&conditions[agencies][]=social-security-administration' +
    '&order=newest&per_page=5&fields[]=title&fields[]=raw_text_url';

async function fetchText(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return res.text();
}

async function main() {
    const source = fs.readFileSync(LIMITS_FILE, 'utf8');
    const tableMatch = source.match(/SOCIAL_SECURITY_WAGE_BASES = (\{[\s\S]*?\});/);
    if (!tableMatch) throw new Error('Could not find SOCIAL_SECURITY_WAGE_BASES in tax-limits.js');
    const table = JSON.parse(tableMatch[1]);

    const latestKnown = Math.max(...Object.keys(table).map(Number));
    const search = JSON.parse(await fetchText(SEARCH_URL));
    let added = 0;
    for (const doc of search.results) {
        const titleYear = (doc.title.match(/for (\d{4})$/) || [])[1];
        if (!titleYear || Number(titleYear) <= latestKnown) continue;

        const text = (await fetchText(doc.raw_text_url)).replace(/\s+/g, ' ');
        const m = text.match(/contribution and benefit base is \$([\d,]+) for remuneration paid in (\d{4})/i);
        if (!m || m[2] !== titleYear) {
            throw new Error(`Found "${doc.title}" but could not read its wage base`);
        }
        const amount = Number(m[1].replace(/,/g, ''));
        if (amount < 100000 || amount > 1000000) throw new Error(`Implausible wage base ${amount} for ${titleYear}`);

        table[titleYear] = amount;
        added++;
        console.log(`Added ${titleYear}: $${amount.toLocaleString('en-US')}`);
    }

    if (added > 0) {
        const sorted = {};
        Object.keys(table).sort().forEach(y => { sorted[y] = table[y]; });
        fs.writeFileSync(LIMITS_FILE, source.replace(tableMatch[1], JSON.stringify(sorted, null, 4)));
    } else {
        console.log('No new wage base published yet. Known years: ' + Object.keys(table).join(', '));
    }

    const thisYear = String(new Date().getUTCFullYear());
    if (!table[thisYear]) {
        throw new Error(`No Social Security wage base for ${thisYear} yet; the app is still using an older year's limit`);
    }
}

main().catch(err => { console.error(err.message); process.exit(1); });
