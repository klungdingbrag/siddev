# Nippon Paint Price List

Status: implementation source added to `ui/ux-polish-v3`; Apps Script deployment and sheet setup remain to be completed by copying the versioned source into the connected Invoice GAS project.

## Decisions

- Reuse the existing Invoice Apps Script deployment and Spreadsheet.
- Keep product data isolated in the `NipponPriceList` tab.
- Store product name, package size, base purchase cost, active status, and timestamps.
- The displayed stored price is HPP dasar/base, before tint.
- Calculate colored HPP as base HPP + manually entered ink cost per package. The manually entered ink cost and color label are temporary browser calculation inputs and are not persisted.
- Access is the same as the existing Invoice GAS endpoint, which may be callable by anyone who knows its URL.

## Source files

- `code-invoice/setup.gs`: `setupNipponPriceListSheet()` creates/verifies only the new price list tab.
- `code-invoice/Code.gs`: `listNipponPrices` and `saveNipponPrice` API actions. Existing invoice save/read functions remain in place.
- `assets/js/pages/nippon-price-list.js` and `assets/css/nippon-price-list.css`: new frontend page and scoped styling.
- `assets/js/app.js` and `index.html`: route, menu, and asset wiring.
- `code-invoice/README.md`: API/setup instructions.

## GAS rollout

1. Copy the latest `code-invoice/Code.gs` and `code-invoice/setup.gs` from this branch into the same Apps Script project as Invoice.
2. Save the GAS source and run `setupNipponPriceListSheet()` once, authorizing access to the existing Invoice Spreadsheet. This helper does not modify Invoice tabs.
3. Deploy a new version of the existing web app deployment, keeping its URL.
4. Confirm `?action=health` returns `priceListReady: true`.
5. Publish the frontend branch and hard-refresh the application. The new menu route is `#price-list-nippon`.

## Behavior

- Product entries can be created and edited; duplicate product name + package size combinations are rejected.
- There is no delete action, protecting saved cost records from accidental removal.
- The HPP calculator is advisory and calculates per package. It does not assume a color/tint formula.
- API calls use the same access policy as Invoice; hiding the menu is not an access-control mechanism.
