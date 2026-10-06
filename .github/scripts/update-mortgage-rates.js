// Writes the latest weekly average mortgage rates to js/mortgage-rates.js.
// Source: Freddie Mac's Primary Mortgage Market Survey (PMMS), published Thursdays.
// The browser can't read Freddie Mac's file directly (no CORS), so the app uses this copy.
const fs = require('fs');
const path = require('path');

const RATES_FILE = path.join(__dirname, '..', '..', 'js', 'mortgage-rates.js');
const PMMS_URL = 'https://www.freddiemac.com/pmms/docs/PMMS_history.csv';

async function main() {
    const res = await fetch(PMMS_URL, { headers: { 'User-Agent': 'Mozilla/5.0 (mybudget-ai rate updater)' } });
    if (!res.ok) throw new Error(`HTTP ${res.status} from Freddie Mac`);
    const lines = (await res.text()).trim().split(/\r?\n/);

    const header = lines[0].split(',');
    const col = { date: header.indexOf('date'), rate30: header.indexOf('pmms30'), rate15: header.indexOf('pmms15') };
    if (col.date < 0 || col.rate30 < 0 || col.rate15 < 0) {
        throw new Error('Freddie Mac changed the PMMS file columns: ' + lines[0]);
    }

    // Latest week that has both rates
    let latest = null;
    for (let i = lines.length - 1; i > 0 && !latest; i--) {
        const cells = lines[i].split(',');
        const rate30 = parseFloat(cells[col.rate30]);
        const rate15 = parseFloat(cells[col.rate15]);
        const m = (cells[col.date] || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (m && rate30 > 0 && rate15 > 0) {
            const asOf = `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
            latest = { asOf, rate30, rate15 };
        }
    }
    if (!latest) throw new Error('No rows with both 30- and 15-year rates found');
    for (const r of [latest.rate30, latest.rate15]) {
        if (r < 1 || r > 20) throw new Error(`Implausible rate ${r} for ${latest.asOf}`);
    }

    const body =
        '// Weekly average U.S. mortgage rates from Freddie Mac\'s Primary Mortgage Market Survey.\n' +
        '// Updated automatically by .github/workflows/update-mortgage-rates.yml; do not edit by hand.\n' +
        'var MORTGAGE_RATES = ' + JSON.stringify({
            source: 'Freddie Mac Primary Mortgage Market Survey',
            sourceUrl: 'https://www.freddiemac.com/pmms',
            asOf: latest.asOf,
            rate30: latest.rate30,
            rate15: latest.rate15
        }, null, 4) + ';\n';

    const current = fs.existsSync(RATES_FILE) ? fs.readFileSync(RATES_FILE, 'utf8') : '';
    if (current === body) {
        console.log(`No change: week of ${latest.asOf} (30-yr ${latest.rate30}%, 15-yr ${latest.rate15}%)`);
        return;
    }
    fs.writeFileSync(RATES_FILE, body);
    console.log(`Updated to week of ${latest.asOf}: 30-yr ${latest.rate30}%, 15-yr ${latest.rate15}%`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
