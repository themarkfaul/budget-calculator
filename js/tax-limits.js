// Social Security wage base (maximum earnings taxed for Social Security) by year.
// Updated automatically by .github/workflows/update-tax-limits.yml from the
// Social Security Administration's yearly notice in the Federal Register.
var SOCIAL_SECURITY_WAGE_BASES = {
    "2025": 176100,
    "2026": 184500,
    "2027": 192300
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

// Federal income tax brackets and standard deductions by tax year, from the IRS's yearly
// Revenue Procedure (2026: Rev. Proc. 2025-32). Each bracket is [income over, rate %].
// Added by hand each fall; the update-tax-limits workflow fails in January if a year is missing.
var FEDERAL_INCOME_TAX = {
    "2026": {
        "standardDeduction": { "single": 16100, "married": 32200, "hoh": 24150 },
        "brackets": {
            "single": [[0, 10], [12400, 12], [50400, 22], [105700, 24], [201775, 32], [256225, 35], [640600, 37]],
            "married": [[0, 10], [24800, 12], [100800, 22], [211400, 24], [403550, 32], [512450, 35], [768700, 37]],
            "hoh": [[0, 10], [17700, 12], [67450, 22], [105700, 24], [201750, 32], [256200, 35], [640600, 37]]
        }
    }
};

// The year's table, or the closest known year
function getFederalTaxTable(year) {
    var years = Object.keys(FEDERAL_INCOME_TAX).map(Number).sort(function (a, b) { return a - b; });
    var best = years[0];
    for (var i = 0; i < years.length; i++) {
        if (years[i] <= year) best = years[i];
    }
    return FEDERAL_INCOME_TAX[best];
}

// Federal income tax on wages after pre-tax deductions (401(k), HSA), using the standard deduction.
// status: 'single' | 'married' (filing jointly) | 'hoh' (head of household)
function federalIncomeTax(wages, status, year) {
    var table = getFederalTaxTable(year);
    var taxable = Math.max(0, wages - table.standardDeduction[status]);
    var brackets = table.brackets[status];
    var tax = 0;
    for (var i = 0; i < brackets.length; i++) {
        var top = i + 1 < brackets.length ? brackets[i + 1][0] : Infinity;
        if (taxable <= brackets[i][0]) break;
        tax += (Math.min(taxable, top) - brackets[i][0]) * brackets[i][1] / 100;
    }
    return tax;
}
