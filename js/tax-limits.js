// Social Security wage base (maximum earnings taxed for Social Security) by year.
// Updated automatically by .github/workflows/update-tax-limits.yml from the
// Social Security Administration's yearly notice in the Federal Register.
var SOCIAL_SECURITY_WAGE_BASES = {
    "2025": 176100,
    "2026": 184500
};

// The current year's wage base, or the latest known year if this year isn't published yet
function getSocialSecurityWageBase(year) {
    var years = Object.keys(SOCIAL_SECURITY_WAGE_BASES).map(Number).sort(function (a, b) { return a - b; });
    var best = years[0];
    for (var i = 0; i < years.length; i++) {
        if (years[i] <= year) best = years[i];
    }
    return SOCIAL_SECURITY_WAGE_BASES[best];
}
